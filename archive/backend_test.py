#!/usr/bin/env python3
"""
Backend API Testing Script for FROGRAM Series Watchlist CRUD
Tests the Series Watchlist endpoints as specified in the review request.
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://frogram-movies.preview.emergentagent.com/api"

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results = []
    
    def add_result(self, test_name, success, message, response_data=None):
        status = "✅ PASS" if success else "❌ FAIL"
        result = f"{status}: {test_name} - {message}"
        if response_data and not success:
            result += f"\nResponse: {json.dumps(response_data, indent=2)}"
        
        self.results.append(result)
        if success:
            self.passed += 1
        else:
            self.failed += 1
        print(result)
    
    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*60}")
        print(f"TEST SUMMARY: {self.passed}/{total} tests passed")
        print(f"{'='*60}")
        return self.failed == 0

def test_series_watchlist_crud():
    """Test Series Watchlist CRUD endpoints"""
    results = TestResults()
    
    # Test credentials
    test_email = "watchlist_test@test.com"
    test_password = "Test123!"
    test_username = "watchlisttester"
    
    # Test data
    test_series = {
        "tmdb_id": 1396,
        "name": "Breaking Bad",
        "poster_path": "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg"
    }
    
    auth_token = None
    watchlist_item_id = None
    
    print(f"Testing Series Watchlist CRUD at {BACKEND_URL}")
    print("="*60)
    
    # Step 1: Register or Login test user
    print("\n1. AUTHENTICATION SETUP")
    
    # Try to register first
    try:
        register_response = requests.post(
            f"{BACKEND_URL}/auth/register",
            json={
                "email": test_email,
                "password": test_password,
                "name": test_username
            },
            timeout=10
        )
        
        if register_response.status_code in [200, 201]:
            auth_token = register_response.json().get("token")
            results.add_result(
                "User Registration", 
                True, 
                f"Successfully registered user {test_email}"
            )
        elif register_response.status_code == 400 and "already registered" in register_response.text.lower():
            # User exists, try login
            login_response = requests.post(
                f"{BACKEND_URL}/auth/login",
                json={
                    "email": test_email,
                    "password": test_password
                },
                timeout=10
            )
            
            if login_response.status_code == 200:
                auth_token = login_response.json().get("token")
                results.add_result(
                    "User Login", 
                    True, 
                    f"Successfully logged in existing user {test_email}"
                )
            else:
                results.add_result(
                    "User Login", 
                    False, 
                    f"Login failed with status {login_response.status_code}",
                    login_response.json() if login_response.headers.get('content-type', '').startswith('application/json') else {"text": login_response.text}
                )
                return results.summary()
        else:
            results.add_result(
                "User Registration", 
                False, 
                f"Registration failed with status {register_response.status_code}",
                register_response.json() if register_response.headers.get('content-type', '').startswith('application/json') else {"text": register_response.text}
            )
            return results.summary()
            
    except Exception as e:
        results.add_result("Authentication Setup", False, f"Exception during auth: {str(e)}")
        return results.summary()
    
    if not auth_token:
        results.add_result("Authentication", False, "No auth token received")
        return results.summary()
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # Step 2: Add series to watchlist
    print("\n2. ADD SERIES TO WATCHLIST")
    try:
        add_response = requests.post(
            f"{BACKEND_URL}/series-watchlist/add",
            json=test_series,
            headers=headers,
            timeout=10
        )
        
        if add_response.status_code in [200, 201]:
            response_data = add_response.json()
            watchlist_item_id = response_data.get("id")
            results.add_result(
                "Add Series to Watchlist", 
                True, 
                f"Successfully added Breaking Bad to watchlist (ID: {watchlist_item_id})"
            )
        else:
            results.add_result(
                "Add Series to Watchlist", 
                False, 
                f"Failed with status {add_response.status_code}",
                add_response.json() if add_response.headers.get('content-type', '').startswith('application/json') else {"text": add_response.text}
            )
            
    except Exception as e:
        results.add_result("Add Series to Watchlist", False, f"Exception: {str(e)}")
    
    # Step 3: Get watchlist (should contain the added series)
    print("\n3. GET WATCHLIST")
    try:
        get_response = requests.get(
            f"{BACKEND_URL}/series-watchlist",
            headers=headers,
            timeout=10
        )
        
        if get_response.status_code == 200:
            watchlist = get_response.json()
            if isinstance(watchlist, list) and len(watchlist) > 0:
                # Check if our series is in the list
                found_series = None
                for item in watchlist:
                    if item.get("tmdb_id") == test_series["tmdb_id"]:
                        found_series = item
                        if not watchlist_item_id:  # In case we didn't get it from add
                            watchlist_item_id = item.get("id")
                        break
                
                if found_series:
                    results.add_result(
                        "Get Watchlist", 
                        True, 
                        f"Watchlist contains Breaking Bad (found {len(watchlist)} items total)"
                    )
                else:
                    results.add_result(
                        "Get Watchlist", 
                        False, 
                        f"Breaking Bad not found in watchlist (got {len(watchlist)} items)",
                        watchlist
                    )
            else:
                results.add_result(
                    "Get Watchlist", 
                    False, 
                    "Watchlist is empty or not a list",
                    watchlist
                )
        else:
            results.add_result(
                "Get Watchlist", 
                False, 
                f"Failed with status {get_response.status_code}",
                get_response.json() if get_response.headers.get('content-type', '').startswith('application/json') else {"text": get_response.text}
            )
            
    except Exception as e:
        results.add_result("Get Watchlist", False, f"Exception: {str(e)}")
    
    # Step 4: Check if series is in watchlist
    print("\n4. CHECK SERIES IN WATCHLIST")
    try:
        check_response = requests.get(
            f"{BACKEND_URL}/series-watchlist/check/{test_series['tmdb_id']}",
            headers=headers,
            timeout=10
        )
        
        if check_response.status_code == 200:
            check_data = check_response.json()
            if check_data.get("in_watchlist") is True:
                results.add_result(
                    "Check Series in Watchlist", 
                    True, 
                    "Breaking Bad correctly reported as in watchlist"
                )
            else:
                results.add_result(
                    "Check Series in Watchlist", 
                    False, 
                    "Breaking Bad not reported as in watchlist",
                    check_data
                )
        else:
            results.add_result(
                "Check Series in Watchlist", 
                False, 
                f"Failed with status {check_response.status_code}",
                check_response.json() if check_response.headers.get('content-type', '').startswith('application/json') else {"text": check_response.text}
            )
            
    except Exception as e:
        results.add_result("Check Series in Watchlist", False, f"Exception: {str(e)}")
    
    # Step 5: Test duplicate add (should handle gracefully)
    print("\n5. TEST DUPLICATE ADD")
    try:
        duplicate_response = requests.post(
            f"{BACKEND_URL}/series-watchlist/add",
            json=test_series,
            headers=headers,
            timeout=10
        )
        
        if duplicate_response.status_code in [200, 400]:
            response_data = duplicate_response.json()
            if "already" in response_data.get("detail", "").lower() or duplicate_response.status_code == 400:
                results.add_result(
                    "Duplicate Add Handling", 
                    True, 
                    "Duplicate add handled gracefully"
                )
            else:
                results.add_result(
                    "Duplicate Add Handling", 
                    True, 
                    f"Duplicate add returned status {duplicate_response.status_code}"
                )
        else:
            results.add_result(
                "Duplicate Add Handling", 
                False, 
                f"Unexpected status {duplicate_response.status_code}",
                duplicate_response.json() if duplicate_response.headers.get('content-type', '').startswith('application/json') else {"text": duplicate_response.text}
            )
            
    except Exception as e:
        results.add_result("Duplicate Add Handling", False, f"Exception: {str(e)}")
    
    # Step 6: Delete series from watchlist
    print("\n6. DELETE SERIES FROM WATCHLIST")
    if watchlist_item_id:
        try:
            delete_response = requests.delete(
                f"{BACKEND_URL}/series-watchlist/{watchlist_item_id}",
                headers=headers,
                timeout=10
            )
            
            if delete_response.status_code == 200:
                results.add_result(
                    "Delete Series from Watchlist", 
                    True, 
                    f"Successfully removed series (ID: {watchlist_item_id})"
                )
            else:
                results.add_result(
                    "Delete Series from Watchlist", 
                    False, 
                    f"Failed with status {delete_response.status_code}",
                    delete_response.json() if delete_response.headers.get('content-type', '').startswith('application/json') else {"text": delete_response.text}
                )
                
        except Exception as e:
            results.add_result("Delete Series from Watchlist", False, f"Exception: {str(e)}")
    else:
        results.add_result("Delete Series from Watchlist", False, "No watchlist item ID available")
    
    # Step 7: Get watchlist again (should be empty or not contain our series)
    print("\n7. VERIFY WATCHLIST AFTER DELETE")
    try:
        final_get_response = requests.get(
            f"{BACKEND_URL}/series-watchlist",
            headers=headers,
            timeout=10
        )
        
        if final_get_response.status_code == 200:
            final_watchlist = final_get_response.json()
            if isinstance(final_watchlist, list):
                # Check if our series is still in the list
                found_series = any(item.get("tmdb_id") == test_series["tmdb_id"] for item in final_watchlist)
                
                if not found_series:
                    results.add_result(
                        "Verify Watchlist After Delete", 
                        True, 
                        f"Breaking Bad successfully removed from watchlist ({len(final_watchlist)} items remaining)"
                    )
                else:
                    results.add_result(
                        "Verify Watchlist After Delete", 
                        False, 
                        "Breaking Bad still found in watchlist after delete",
                        final_watchlist
                    )
            else:
                results.add_result(
                    "Verify Watchlist After Delete", 
                    False, 
                    "Watchlist response is not a list",
                    final_watchlist
                )
        else:
            results.add_result(
                "Verify Watchlist After Delete", 
                False, 
                f"Failed with status {final_get_response.status_code}",
                final_get_response.json() if final_get_response.headers.get('content-type', '').startswith('application/json') else {"text": final_get_response.text}
            )
            
    except Exception as e:
        results.add_result("Verify Watchlist After Delete", False, f"Exception: {str(e)}")
    
    # Step 8: Final check - series should not be in watchlist
    print("\n8. FINAL CHECK - SERIES NOT IN WATCHLIST")
    try:
        final_check_response = requests.get(
            f"{BACKEND_URL}/series-watchlist/check/{test_series['tmdb_id']}",
            headers=headers,
            timeout=10
        )
        
        if final_check_response.status_code == 200:
            final_check_data = final_check_response.json()
            if final_check_data.get("in_watchlist") is False:
                results.add_result(
                    "Final Check - Not in Watchlist", 
                    True, 
                    "Breaking Bad correctly reported as NOT in watchlist"
                )
            else:
                results.add_result(
                    "Final Check - Not in Watchlist", 
                    False, 
                    "Breaking Bad still reported as in watchlist",
                    final_check_data
                )
        else:
            results.add_result(
                "Final Check - Not in Watchlist", 
                False, 
                f"Failed with status {final_check_response.status_code}",
                final_check_response.json() if final_check_response.headers.get('content-type', '').startswith('application/json') else {"text": final_check_response.text}
            )
            
    except Exception as e:
        results.add_result("Final Check - Not in Watchlist", False, f"Exception: {str(e)}")
    
    return results.summary()

def test_share_image_generation():
    """Test Share Image Generation endpoints"""
    results = TestResults()
    
    print("\n" + "="*60)
    print("🖼️  TESTING SHARE IMAGE GENERATION ENDPOINTS")
    print("="*60)
    
    # Test 1: POST /api/share/collage with valid poster paths
    print("\n🧪 Test 1: POST /api/share/collage with valid poster paths")
    payload = {
        "poster_paths": [
            "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
            "/6MKr3KgOLmzOP6MSuZERO41Lpkt.jpg", 
            "/1E5baAaEse26fej7uHcjOgEERB2.jpg"
        ],
        "title": "My FROGRAM Library"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/share/collage", json=payload, timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Content-Type: {response.headers.get('content-type', 'N/A')}")
        print(f"Content-Length: {len(response.content)} bytes")
        
        if response.status_code == 200 and response.headers.get('content-type') == 'image/jpeg':
            results.add_result("Share Collage Valid", True, f"Returns {len(response.content)} bytes JPEG image")
        else:
            results.add_result("Share Collage Valid", False, 
                             f"Expected 200 + image/jpeg, got {response.status_code} + {response.headers.get('content-type')}")
    except Exception as e:
        results.add_result("Share Collage Valid", False, f"Request failed: {str(e)}")
    
    # Test 2: POST /api/share/list-image with valid movie list
    print("\n🧪 Test 2: POST /api/share/list-image with valid movie list")
    payload = {
        "movies": [
            {"title": "Breaking Bad", "user_rating": 9.5, "year": "2008"},
            {"title": "The Godfather", "user_rating": 9.0, "year": "1972"},
            {"title": "Inception", "user_rating": 8.5, "year": "2010"}
        ],
        "title": "My FROGRAM Watchlist"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/share/list-image", json=payload, timeout=30)
        print(f"Status: {response.status_code}")
        print(f"Content-Type: {response.headers.get('content-type', 'N/A')}")
        print(f"Content-Length: {len(response.content)} bytes")
        
        if response.status_code == 200 and response.headers.get('content-type') == 'image/jpeg':
            results.add_result("Share List Image Valid", True, f"Returns {len(response.content)} bytes JPEG image")
        else:
            results.add_result("Share List Image Valid", False, 
                             f"Expected 200 + image/jpeg, got {response.status_code} + {response.headers.get('content-type')}")
    except Exception as e:
        results.add_result("Share List Image Valid", False, f"Request failed: {str(e)}")
    
    # Test 3: POST /api/share/collage with empty poster_paths (should return 400)
    print("\n🧪 Test 3: POST /api/share/collage with empty poster_paths")
    payload = {
        "poster_paths": [],
        "title": "My FROGRAM Library"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/share/collage", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 400:
            results.add_result("Share Collage Empty Posters", True, "Correctly returns 400 for empty poster_paths")
        else:
            results.add_result("Share Collage Empty Posters", False, 
                             f"Expected 400, got {response.status_code}")
    except Exception as e:
        results.add_result("Share Collage Empty Posters", False, f"Request failed: {str(e)}")
    
    # Test 4: POST /api/share/list-image with empty movies (should return 400)
    print("\n🧪 Test 4: POST /api/share/list-image with empty movies")
    payload = {
        "movies": [],
        "title": "My FROGRAM Watchlist"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/share/list-image", json=payload, timeout=10)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 400:
            results.add_result("Share List Image Empty Movies", True, "Correctly returns 400 for empty movies")
        else:
            results.add_result("Share List Image Empty Movies", False, 
                             f"Expected 400, got {response.status_code}")
    except Exception as e:
        results.add_result("Share List Image Empty Movies", False, f"Request failed: {str(e)}")
    
    return results.summary()

if __name__ == "__main__":
    print("FROGRAM Backend API Testing")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test started at: {datetime.now()}")
    
    # Run Series Watchlist tests
    print("\n" + "="*60)
    print("📺 SERIES WATCHLIST CRUD TESTING")
    print("="*60)
    watchlist_success = test_series_watchlist_crud()
    
    # Run Share Image Generation tests
    share_success = test_share_image_generation()
    
    print(f"\nTest completed at: {datetime.now()}")
    
    # Overall success if both test suites pass
    overall_success = watchlist_success and share_success
    print(f"\n🎯 OVERALL RESULT: {'✅ ALL TESTS PASSED' if overall_success else '❌ SOME TESTS FAILED'}")
    
    sys.exit(0 if overall_success else 1)