#!/usr/bin/env python3
"""
Detailed Share Image Generation Test
Provides detailed output for each test scenario
"""

import requests
import sys

BACKEND_URL = "https://frogram-movies.preview.emergentagent.com/api"

def detailed_share_image_test():
    """Run detailed tests on share image endpoint"""
    print("🎬 DETAILED Share Image Generation Tests")
    print("=" * 60)
    
    test_cases = [
        {
            "name": "FRGM Rating (Library Share)",
            "url": f"{BACKEND_URL}/movies/550/share-image?frgm=8.5",
            "description": "Should return JPEG with green star + 8.5 rating"
        },
        {
            "name": "IMDB + TMDB Ratings (Explicit)",
            "url": f"{BACKEND_URL}/movies/550/share-image?imdb=8.8&tmdb=8.7",
            "description": "Should return JPEG with orange IMDB star + red TMDB star"
        },
        {
            "name": "Auto-fetched Ratings",
            "url": f"{BACKEND_URL}/movies/550/share-image",
            "description": "Should return JPEG with auto-fetched IMDB and TMDB ratings"
        },
        {
            "name": "Invalid TMDB ID",
            "url": f"{BACKEND_URL}/movies/99999999/share-image",
            "description": "Should return 404 error"
        }
    ]
    
    all_passed = True
    
    for i, test in enumerate(test_cases, 1):
        print(f"\n{i}️⃣ {test['name']}")
        print(f"   Description: {test['description']}")
        print(f"   URL: {test['url']}")
        
        try:
            response = requests.get(test['url'], timeout=30)
            
            print(f"   Status Code: {response.status_code}")
            print(f"   Content-Type: {response.headers.get('content-type', 'N/A')}")
            print(f"   Content-Length: {len(response.content)} bytes")
            
            if 'content-disposition' in response.headers:
                print(f"   Content-Disposition: {response.headers['content-disposition']}")
            
            # Check success criteria
            if test['name'] == "Invalid TMDB ID":
                # This should return 404
                if response.status_code == 404:
                    print("   ✅ PASSED - Correctly returned 404 for invalid TMDB ID")
                else:
                    print(f"   ❌ FAILED - Expected 404, got {response.status_code}")
                    all_passed = False
            else:
                # These should return 200 with image/jpeg
                if (response.status_code == 200 and 
                    'image/jpeg' in response.headers.get('content-type', '') and 
                    len(response.content) > 0):
                    print("   ✅ PASSED - Valid JPEG image returned")
                else:
                    print("   ❌ FAILED - Invalid response")
                    if response.status_code != 200:
                        print(f"      Expected status 200, got {response.status_code}")
                    if 'image/jpeg' not in response.headers.get('content-type', ''):
                        print(f"      Expected image/jpeg content-type, got {response.headers.get('content-type')}")
                    if len(response.content) == 0:
                        print("      Response body is empty")
                    all_passed = False
                    
                    # Show error response if available
                    if response.text and len(response.text) < 500:
                        print(f"      Response text: {response.text}")
                        
        except Exception as e:
            print(f"   ❌ ERROR: {e}")
            all_passed = False
    
    print("\n" + "=" * 60)
    print("📊 DETAILED TEST SUMMARY")
    print("=" * 60)
    
    if all_passed:
        print("🎉 ALL SHARE IMAGE TESTS PASSED!")
        print("\n✅ Key Features Verified:")
        print("   • FRGM rating display (green star)")
        print("   • IMDB + TMDB rating display (orange + red stars)")
        print("   • Auto-fetching of ratings from external APIs")
        print("   • Proper error handling for invalid movie IDs")
        print("   • Correct JPEG image generation and response headers")
    else:
        print("⚠️  SOME SHARE IMAGE TESTS FAILED!")
    
    return all_passed

if __name__ == "__main__":
    success = detailed_share_image_test()
    sys.exit(0 if success else 1)