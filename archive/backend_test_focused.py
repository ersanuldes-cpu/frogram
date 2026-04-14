#!/usr/bin/env python3
"""
FROGRAM Backend API Testing Script - Focused Version
Tests all backend APIs for the mobile movie tracking app
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://frogram-movies.preview.emergentagent.com/api"

def log_test(test_name, status, details=""):
    """Log test results"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    status_symbol = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"[{timestamp}] {status_symbol} {test_name}")
    if details:
        print(f"    {details}")

def test_comprehensive_backend():
    """Run comprehensive backend tests"""
    print("🚀 Starting FROGRAM Backend API Tests")
    print("=" * 50)
    
    results = []
    
    # 1. Health Check
    try:
        response = requests.get(f"{BASE_URL}/", timeout=30)
        if response.status_code == 200 and response.json().get("status") == "running":
            log_test("Health Check", "PASS", "API is running")
            results.append(True)
        else:
            log_test("Health Check", "FAIL", f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Health Check", "FAIL", str(e))
        results.append(False)
    
    # 2. User Registration/Login
    auth_token = None
    user_id = None
    
    # Try registration first
    try:
        reg_data = {
            "email": "testuser@frogram.com",
            "password": "testpass123",
            "name": "Test User"
        }
        response = requests.post(f"{BASE_URL}/auth/register", json=reg_data, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            auth_token = result["token"]
            user_id = result["user"]["user_id"]
            log_test("User Registration", "PASS", f"User created: {user_id}")
            results.append(True)
        elif response.status_code == 400:
            # User exists, try login
            login_data = {
                "email": "testuser@frogram.com",
                "password": "testpass123"
            }
            response = requests.post(f"{BASE_URL}/auth/login", json=login_data, timeout=30)
            if response.status_code == 200:
                result = response.json()
                auth_token = result["token"]
                user_id = result["user"]["user_id"]
                log_test("User Login", "PASS", f"Login successful: {user_id}")
                results.append(True)
            else:
                log_test("Authentication", "FAIL", f"Login failed: {response.status_code}")
                results.append(False)
        else:
            log_test("Authentication", "FAIL", f"Registration failed: {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Authentication", "FAIL", str(e))
        results.append(False)
    
    if not auth_token:
        log_test("Skipping authenticated tests", "FAIL", "No auth token available")
        return results
    
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # 3. Get Current User
    try:
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=30)
        if response.status_code == 200:
            user_data = response.json()
            log_test("Get Current User", "PASS", f"User: {user_data.get('name')}")
            results.append(True)
        else:
            log_test("Get Current User", "FAIL", f"Status: {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Get Current User", "FAIL", str(e))
        results.append(False)
    
    # 4. Movie Search APIs
    test_movie_id = None
    try:
        # Search movies
        response = requests.get(f"{BASE_URL}/movies/search", params={"query": "inception"}, timeout=30)
        if response.status_code == 200:
            data = response.json()
            if "results" in data and len(data["results"]) > 0:
                test_movie_id = data["results"][0]["id"]
                log_test("Movie Search", "PASS", f"Found {len(data['results'])} movies")
                results.append(True)
            else:
                log_test("Movie Search", "FAIL", "No results found")
                results.append(False)
        else:
            log_test("Movie Search", "FAIL", f"Status: {response.status_code}")
            results.append(False)
        
        # Popular movies
        response = requests.get(f"{BASE_URL}/movies/popular", timeout=30)
        if response.status_code == 200:
            data = response.json()
            log_test("Popular Movies", "PASS", f"Found {len(data.get('results', []))} movies")
            results.append(True)
        else:
            log_test("Popular Movies", "FAIL", f"Status: {response.status_code}")
            results.append(False)
        
        # Trending movies
        response = requests.get(f"{BASE_URL}/movies/trending", timeout=30)
        if response.status_code == 200:
            data = response.json()
            log_test("Trending Movies", "PASS", f"Found {len(data.get('results', []))} movies")
            results.append(True)
        else:
            log_test("Trending Movies", "FAIL", f"Status: {response.status_code}")
            results.append(False)
        
        # Movie details
        if test_movie_id:
            response = requests.get(f"{BASE_URL}/movies/{test_movie_id}", timeout=30)
            if response.status_code == 200:
                movie_data = response.json()
                log_test("Movie Details", "PASS", f"Movie: {movie_data.get('title')}")
                results.append(True)
            else:
                log_test("Movie Details", "FAIL", f"Status: {response.status_code}")
                results.append(False)
        else:
            log_test("Movie Details", "FAIL", "No test movie ID")
            results.append(False)
            
    except Exception as e:
        log_test("Movie APIs", "FAIL", str(e))
        results.extend([False, False, False, False])
    
    # 5. Library Management
    library_movie_id = None
    try:
        if test_movie_id:
            # Add to library
            movie_data = {
                "tmdb_id": test_movie_id,
                "title": "Inception",
                "poster_path": "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
                "backdrop_path": "/s3TBrRGB1iav7gFOCNx3H31MoES.jpg",
                "release_date": "2010-07-16",
                "overview": "A thief who steals corporate secrets...",
                "vote_average": 8.4,
                "genres": ["Action", "Science Fiction", "Adventure"]
            }
            
            response = requests.post(f"{BASE_URL}/library/add", json=movie_data, headers=headers, timeout=30)
            if response.status_code == 200:
                result = response.json()
                library_movie_id = result.get("id")
                log_test("Add to Library", "PASS", f"Movie added: {library_movie_id}")
                results.append(True)
            elif response.status_code == 400:
                log_test("Add to Library", "WARN", "Movie already in library")
                # Get library to find movie ID
                response = requests.get(f"{BASE_URL}/library", headers=headers, timeout=30)
                if response.status_code == 200:
                    movies = response.json()
                    for movie in movies:
                        if movie.get("tmdb_id") == test_movie_id:
                            library_movie_id = movie.get("id")
                            break
                results.append(True)
            else:
                log_test("Add to Library", "FAIL", f"Status: {response.status_code}")
                results.append(False)
            
            # Get library
            response = requests.get(f"{BASE_URL}/library", headers=headers, timeout=30)
            if response.status_code == 200:
                movies = response.json()
                log_test("Get Library", "PASS", f"Found {len(movies)} movies")
                results.append(True)
            else:
                log_test("Get Library", "FAIL", f"Status: {response.status_code}")
                results.append(False)
            
            # Rate movie
            if library_movie_id:
                rating_data = {"rating": 8.5, "review": "Amazing movie!"}
                response = requests.put(f"{BASE_URL}/library/{library_movie_id}/rate", 
                                      json=rating_data, headers=headers, timeout=30)
                if response.status_code == 200:
                    log_test("Rate Movie", "PASS", "Movie rated successfully")
                    results.append(True)
                else:
                    log_test("Rate Movie", "FAIL", f"Status: {response.status_code}")
                    results.append(False)
            else:
                log_test("Rate Movie", "FAIL", "No library movie ID")
                results.append(False)
            
            # Check in library
            response = requests.get(f"{BASE_URL}/library/check/{test_movie_id}", headers=headers, timeout=30)
            if response.status_code == 200:
                result = response.json()
                if result.get("in_library"):
                    log_test("Check in Library", "PASS", "Movie found in library")
                    results.append(True)
                else:
                    log_test("Check in Library", "FAIL", "Movie not in library")
                    results.append(False)
            else:
                log_test("Check in Library", "FAIL", f"Status: {response.status_code}")
                results.append(False)
        else:
            log_test("Library Management", "FAIL", "No test movie ID")
            results.extend([False, False, False, False])
    except Exception as e:
        log_test("Library Management", "FAIL", str(e))
        results.extend([False, False, False, False])
    
    # 6. Social Features
    second_user_id = None
    second_user_token = None
    try:
        # Create second user
        second_user_data = {
            "email": "testuser2@frogram.com",
            "password": "testpass123",
            "name": "Test User 2"
        }
        
        response = requests.post(f"{BASE_URL}/auth/register", json=second_user_data, timeout=30)
        if response.status_code == 200:
            result = response.json()
            second_user_id = result["user"]["user_id"]
            second_user_token = result["token"]
            log_test("Create Second User", "PASS", f"User: {second_user_id}")
            results.append(True)
        elif response.status_code == 400:
            # User exists, try login
            login_data = {"email": "testuser2@frogram.com", "password": "testpass123"}
            response = requests.post(f"{BASE_URL}/auth/login", json=login_data, timeout=30)
            if response.status_code == 200:
                result = response.json()
                second_user_id = result["user"]["user_id"]
                second_user_token = result["token"]
                log_test("Login Second User", "PASS", f"User: {second_user_id}")
                results.append(True)
            else:
                log_test("Second User Auth", "FAIL", f"Status: {response.status_code}")
                results.append(False)
        else:
            log_test("Create Second User", "FAIL", f"Status: {response.status_code}")
            results.append(False)
        
        if second_user_id:
            # Search users
            response = requests.get(f"{BASE_URL}/users/search", params={"query": "Test"}, headers=headers, timeout=30)
            if response.status_code == 200:
                users = response.json()
                log_test("Search Users", "PASS", f"Found {len(users)} users")
                results.append(True)
            else:
                log_test("Search Users", "FAIL", f"Status: {response.status_code}")
                results.append(False)
            
            # Follow user
            response = requests.post(f"{BASE_URL}/users/{second_user_id}/follow", headers=headers, timeout=30)
            if response.status_code == 200:
                log_test("Follow User", "PASS", "Successfully followed user")
                results.append(True)
            elif response.status_code == 400:
                log_test("Follow User", "WARN", "Already following user")
                results.append(True)
            else:
                log_test("Follow User", "FAIL", f"Status: {response.status_code}")
                results.append(False)
            
            # Get following
            response = requests.get(f"{BASE_URL}/following", headers=headers, timeout=30)
            if response.status_code == 200:
                following = response.json()
                log_test("Get Following", "PASS", f"Following {len(following)} users")
                results.append(True)
            else:
                log_test("Get Following", "FAIL", f"Status: {response.status_code}")
                results.append(False)
            
            # Get followers
            response = requests.get(f"{BASE_URL}/followers", headers=headers, timeout=30)
            if response.status_code == 200:
                followers = response.json()
                log_test("Get Followers", "PASS", f"Has {len(followers)} followers")
                results.append(True)
            else:
                log_test("Get Followers", "FAIL", f"Status: {response.status_code}")
                results.append(False)
        else:
            log_test("Social Features", "FAIL", "No second user")
            results.extend([False, False, False, False])
    except Exception as e:
        log_test("Social Features", "FAIL", str(e))
        results.extend([False, False, False, False, False])
    
    # 7. Recommendations
    try:
        if second_user_id and test_movie_id:
            # Send recommendation
            rec_data = {
                "to_user_id": second_user_id,
                "tmdb_id": test_movie_id,
                "title": "Inception",
                "poster_path": "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
                "message": "You should watch this!"
            }
            
            response = requests.post(f"{BASE_URL}/recommendations", json=rec_data, headers=headers, timeout=30)
            if response.status_code == 200:
                log_test("Send Recommendation", "PASS", "Recommendation sent")
                results.append(True)
            else:
                log_test("Send Recommendation", "FAIL", f"Status: {response.status_code}")
                results.append(False)
            
            # Get recommendations (as second user)
            second_headers = {"Authorization": f"Bearer {second_user_token}"}
            response = requests.get(f"{BASE_URL}/recommendations", headers=second_headers, timeout=30)
            if response.status_code == 200:
                recommendations = response.json()
                log_test("Get Recommendations", "PASS", f"Found {len(recommendations)} recommendations")
                results.append(True)
            else:
                log_test("Get Recommendations", "FAIL", f"Status: {response.status_code}")
                results.append(False)
        else:
            log_test("Recommendations", "FAIL", "Missing required data")
            results.extend([False, False])
    except Exception as e:
        log_test("Recommendations", "FAIL", str(e))
        results.extend([False, False])
    
    # 8. Chat Features
    try:
        if second_user_id:
            # Send chat message
            message_data = {
                "to_user_id": second_user_id,
                "message": "Hello! How are you doing?"
            }
            
            response = requests.post(f"{BASE_URL}/chats/{second_user_id}", json=message_data, headers=headers, timeout=30)
            if response.status_code == 200:
                log_test("Send Chat Message", "PASS", "Message sent successfully")
                results.append(True)
            else:
                log_test("Send Chat Message", "FAIL", f"Status: {response.status_code}")
                results.append(False)
            
            # Get chat list
            response = requests.get(f"{BASE_URL}/chats", headers=headers, timeout=30)
            if response.status_code == 200:
                chats = response.json()
                log_test("Get Chat List", "PASS", f"Found {len(chats)} chats")
                results.append(True)
            else:
                log_test("Get Chat List", "FAIL", f"Status: {response.status_code}")
                results.append(False)
            
            # Get chat messages
            response = requests.get(f"{BASE_URL}/chats/{second_user_id}", headers=headers, timeout=30)
            if response.status_code == 200:
                messages = response.json()
                log_test("Get Chat Messages", "PASS", f"Found {len(messages)} messages")
                results.append(True)
            else:
                log_test("Get Chat Messages", "FAIL", f"Status: {response.status_code}")
                results.append(False)
        else:
            log_test("Chat Features", "FAIL", "No second user")
            results.extend([False, False, False])
    except Exception as e:
        log_test("Chat Features", "FAIL", str(e))
        results.extend([False, False, False])
    
    # 9. Security Test
    try:
        response = requests.get(f"{BASE_URL}/auth/me", timeout=30)
        if response.status_code == 401:
            log_test("Unauthorized Access Protection", "PASS", "Protected endpoint requires auth")
            results.append(True)
        else:
            log_test("Unauthorized Access Protection", "FAIL", f"Expected 401, got {response.status_code}")
            results.append(False)
    except Exception as e:
        log_test("Unauthorized Access Protection", "FAIL", str(e))
        results.append(False)
    
    # Summary
    print("\n" + "=" * 50)
    passed = sum(results)
    total = len(results)
    print(f"📊 Test Results: {passed}/{total} tests passed")
    
    if passed >= total * 0.8:  # 80% pass rate
        print("🎉 Backend is working well!")
        return True
    else:
        print(f"⚠️  {total - passed} tests failed. Please check the issues above.")
        return False

if __name__ == "__main__":
    success = test_comprehensive_backend()
    sys.exit(0 if success else 1)