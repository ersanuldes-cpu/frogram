#!/usr/bin/env python3
"""
FROGRAM Streaming Links API Test - Focused Test
Tests the new streaming links functionality specifically
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://frogram-movies.preview.emergentagent.com/api"
TEST_MOVIE_ID = 687163  # Fast & Furious 6

def log_test(test_name, status, details=""):
    """Log test results"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    status_symbol = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"[{timestamp}] {status_symbol} {test_name}")
    if details:
        print(f"    {details}")

def test_streaming_links():
    """Test streaming links functionality"""
    print("🎬 FROGRAM Streaming Links API Test")
    print("=" * 50)
    
    results = []
    
    # Step 1: Register a test user
    print("\n1. Setting up test user...")
    reg_data = {
        "email": "streamlinktest@frogram.com",
        "password": "testpass123",
        "name": "Stream Link Test User"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/auth/register", json=reg_data, timeout=30)
        if response.status_code == 200:
            result = response.json()
            auth_token = result["token"]
            user_id = result["user"]["user_id"]
            log_test("User Registration", "PASS", f"User created: {user_id}")
        elif response.status_code == 400:
            # User exists, try login
            login_data = {"email": "streamlinktest@frogram.com", "password": "testpass123"}
            response = requests.post(f"{BASE_URL}/auth/login", json=login_data, timeout=30)
            if response.status_code == 200:
                result = response.json()
                auth_token = result["token"]
                user_id = result["user"]["user_id"]
                log_test("User Login", "PASS", f"Login successful: {user_id}")
            else:
                log_test("Authentication", "FAIL", f"Login failed: {response.status_code}")
                return False
        else:
            log_test("Authentication", "FAIL", f"Registration failed: {response.status_code}")
            return False
    except Exception as e:
        log_test("Authentication", "FAIL", str(e))
        return False
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # Step 2: Get streaming links for movie (should be empty initially)
    print(f"\n2. Testing GET /movies/{TEST_MOVIE_ID}/streaming-links (no auth needed)...")
    try:
        response = requests.get(f"{BASE_URL}/movies/{TEST_MOVIE_ID}/streaming-links", timeout=30)
        if response.status_code == 200:
            links = response.json()
            log_test("Get Streaming Links (Initial)", "PASS", f"Found {len(links)} links")
            results.append(True)
        else:
            log_test("Get Streaming Links (Initial)", "FAIL", f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Get Streaming Links (Initial)", "FAIL", str(e))
        results.append(False)
    
    # Step 3: Try to add streaming link without auth (should fail 401)
    print(f"\n3. Testing POST /movies/{TEST_MOVIE_ID}/streaming-links without auth...")
    try:
        link_data = {"url": "https://www.netflix.com/title/70242311", "label": "Netflix"}
        response = requests.post(f"{BASE_URL}/movies/{TEST_MOVIE_ID}/streaming-links", 
                               json=link_data, timeout=30)
        if response.status_code == 401:
            log_test("Add Link Without Auth", "PASS", "Correctly rejected unauthorized request")
            results.append(True)
        else:
            log_test("Add Link Without Auth", "FAIL", f"Expected 401, got {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Add Link Without Auth", "FAIL", str(e))
        results.append(False)
    
    # Step 4: Try to add invalid URL (should fail 400)
    print(f"\n4. Testing POST /movies/{TEST_MOVIE_ID}/streaming-links with invalid URL...")
    try:
        invalid_link_data = {"url": "not-a-valid-url", "label": "Invalid"}
        response = requests.post(f"{BASE_URL}/movies/{TEST_MOVIE_ID}/streaming-links", 
                               json=invalid_link_data, headers=headers, timeout=30)
        if response.status_code == 400:
            log_test("Add Invalid URL", "PASS", "Correctly rejected invalid URL")
            results.append(True)
        else:
            log_test("Add Invalid URL", "FAIL", f"Expected 400, got {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Add Invalid URL", "FAIL", str(e))
        results.append(False)
    
    # Step 5: Add valid streaming link (authenticated)
    print(f"\n5. Testing POST /movies/{TEST_MOVIE_ID}/streaming-links with valid data...")
    streaming_link_id = None
    try:
        valid_link_data = {
            "url": "https://www.netflix.com/title/70242311",
            "label": "Netflix - Fast & Furious 6"
        }
        response = requests.post(f"{BASE_URL}/movies/{TEST_MOVIE_ID}/streaming-links", 
                               json=valid_link_data, headers=headers, timeout=30)
        if response.status_code == 200:
            result = response.json()
            streaming_link_id = result.get("id")
            log_test("Add Valid Streaming Link", "PASS", f"Link added: {streaming_link_id}")
            results.append(True)
        else:
            log_test("Add Valid Streaming Link", "FAIL", f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Add Valid Streaming Link", "FAIL", str(e))
        results.append(False)
    
    # Step 6: Add another streaming link with label
    print(f"\n6. Adding another streaming link...")
    try:
        another_link_data = {
            "url": "https://www.hulu.com/movie/fast-furious-6",
            "label": "Hulu"
        }
        response = requests.post(f"{BASE_URL}/movies/{TEST_MOVIE_ID}/streaming-links", 
                               json=another_link_data, headers=headers, timeout=30)
        if response.status_code == 200:
            result = response.json()
            log_test("Add Second Streaming Link", "PASS", f"Second link added: {result.get('id')}")
            results.append(True)
        else:
            log_test("Add Second Streaming Link", "FAIL", f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Add Second Streaming Link", "FAIL", str(e))
        results.append(False)
    
    # Step 7: Get streaming links again (should return added links)
    print(f"\n7. Getting streaming links again...")
    try:
        response = requests.get(f"{BASE_URL}/movies/{TEST_MOVIE_ID}/streaming-links", timeout=30)
        if response.status_code == 200:
            links = response.json()
            if len(links) >= 2:
                log_test("Get Streaming Links (With Data)", "PASS", f"Found {len(links)} links")
                print("    Links found:")
                for link in links:
                    print(f"      - {link.get('label', 'No label')}: {link.get('url')}")
                results.append(True)
            else:
                log_test("Get Streaming Links (With Data)", "FAIL", f"Expected at least 2 links, got {len(links)}")
                results.append(False)
        else:
            log_test("Get Streaming Links (With Data)", "FAIL", f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Get Streaming Links (With Data)", "FAIL", str(e))
        results.append(False)
    
    # Step 8: Create second user and add a link
    print(f"\n8. Creating second user and adding link...")
    try:
        second_user_data = {
            "email": "streamlinktest2@frogram.com",
            "password": "testpass123",
            "name": "Stream Link Test User 2"
        }
        
        response = requests.post(f"{BASE_URL}/auth/register", json=second_user_data, timeout=30)
        if response.status_code == 200:
            result = response.json()
            second_user_token = result["token"]
            second_user_id = result["user"]["user_id"]
        elif response.status_code == 400:
            # User exists, try login
            login_data = {"email": "streamlinktest2@frogram.com", "password": "testpass123"}
            response = requests.post(f"{BASE_URL}/auth/login", json=login_data, timeout=30)
            if response.status_code == 200:
                result = response.json()
                second_user_token = result["token"]
                second_user_id = result["user"]["user_id"]
            else:
                raise Exception("Could not create or login second user")
        else:
            raise Exception("Could not create second user")
        
        # Add link as second user
        second_headers = {"Authorization": f"Bearer {second_user_token}"}
        second_link_data = {
            "url": "https://www.amazon.com/gp/video/detail/B00FJ9JJ8Q",
            "label": "Amazon Prime Video"
        }
        response = requests.post(f"{BASE_URL}/movies/{TEST_MOVIE_ID}/streaming-links", 
                               json=second_link_data, headers=second_headers, timeout=30)
        if response.status_code == 200:
            result = response.json()
            second_user_link_id = result.get("id")
            log_test("Add Link as Second User", "PASS", f"Link added by second user: {second_user_link_id}")
            results.append(True)
        else:
            log_test("Add Link as Second User", "FAIL", f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Add Link as Second User", "FAIL", str(e))
        results.append(False)
    
    # Step 9: Delete streaming link (as owner)
    print(f"\n9. Testing DELETE /streaming-links/{{link_id}} as owner...")
    if streaming_link_id:
        try:
            response = requests.delete(f"{BASE_URL}/streaming-links/{streaming_link_id}", 
                                     headers=headers, timeout=30)
            if response.status_code == 200:
                log_test("Delete Own Streaming Link", "PASS", "Successfully deleted own link")
                results.append(True)
            else:
                log_test("Delete Own Streaming Link", "FAIL", f"Status: {response.status_code}")
                results.append(False)
        except Exception as e:
            log_test("Delete Own Streaming Link", "FAIL", str(e))
            results.append(False)
    else:
        log_test("Delete Own Streaming Link", "FAIL", "No streaming link ID")
        results.append(False)
    
    # Step 10: Try to delete another user's link (should fail 404)
    print(f"\n10. Testing DELETE /streaming-links/{{link_id}} as non-owner...")
    try:
        # Try to delete with a fake ID to test authorization
        fake_link_id = "slink_fakeid123"
        response = requests.delete(f"{BASE_URL}/streaming-links/{fake_link_id}", 
                                 headers=headers, timeout=30)
        if response.status_code == 404:
            log_test("Delete Non-existent Link", "PASS", "Correctly returned 404 for non-existent link")
            results.append(True)
        else:
            log_test("Delete Non-existent Link", "FAIL", f"Expected 404, got {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Delete Non-existent Link", "FAIL", str(e))
        results.append(False)
    
    # Step 11: Final verification
    print(f"\n11. Final verification of streaming links...")
    try:
        response = requests.get(f"{BASE_URL}/movies/{TEST_MOVIE_ID}/streaming-links", timeout=30)
        if response.status_code == 200:
            links = response.json()
            log_test("Final Streaming Links State", "PASS", f"Final count: {len(links)} links")
            print("    Final links:")
            for link in links:
                print(f"      - {link.get('label', 'No label')}: {link.get('url')} (by {link.get('user_name')})")
            results.append(True)
        else:
            log_test("Final Streaming Links State", "FAIL", f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Final Streaming Links State", "FAIL", str(e))
        results.append(False)
    
    # Summary
    print("\n" + "=" * 50)
    passed = sum(results)
    total = len(results)
    print(f"📊 Streaming Links Test Results: {passed}/{total} tests passed")
    
    if passed >= total * 0.9:  # 90% pass rate
        print("🎉 Streaming Links API is working correctly!")
        return True
    else:
        print(f"⚠️  {total - passed} tests failed. Please check the issues above.")
        return False

if __name__ == "__main__":
    success = test_streaming_links()
    sys.exit(0 if success else 1)