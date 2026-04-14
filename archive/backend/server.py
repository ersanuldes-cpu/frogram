from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
from passlib.context import CryptContext
from jose import JWTError, jwt
import socketio
from PIL import ImageFont

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Helper: robust font loading for Pillow (works across different containers)
def _load_font(size: int, bold: bool = False):
    """Try multiple font paths for cross-platform compatibility."""
    font_candidates = [
        f"/usr/share/fonts/truetype/liberation/LiberationSans-{'Bold' if bold else 'Regular'}.ttf",
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if bold else ''}.ttf",
        f"/usr/share/fonts/truetype/freefont/FreeSans{'Bold' if bold else ''}.ttf",
        f"/usr/share/fonts/TTF/DejaVuSans{'-Bold' if bold else ''}.ttf",
    ]
    for path in font_candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'frogram_db')]

# Reusable HTTP client for TMDB/OMDB API calls
http_client = httpx.AsyncClient(timeout=10)

# Temporary image store for share downloads (in-memory with expiry)
import time as _time
_temp_images: dict = {}  # {download_id: {"data": bytes, "created": float}}

def _cleanup_temp_images():
    """Remove images older than 5 minutes"""
    now = _time.time()
    expired = [k for k, v in _temp_images.items() if now - v["created"] > 300]
    for k in expired:
        del _temp_images[k]

# JWT Settings
SECRET_KEY = os.environ.get('JWT_SECRET', 'frogram-secret-key-2024-very-secure')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

# TMDB API
TMDB_API_KEY = os.environ.get('TMDB_API_KEY', '862fd1cbc9c2b9a82a8143fafa4e5b7f')
TMDB_BASE_URL = "https://api.themoviedb.org/3"

# OMDB API
OMDB_API_KEY = os.environ.get('OMDB_API_KEY', 'd9a9dfe9')
OMDB_BASE_URL = "http://www.omdbapi.com"

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Create the main app
app = FastAPI(title="FROGRAM API", version="1.0.0")

# Auth callback HTML handler for deployed web version
# When OAuth redirects to /auth-callback#session_id=xxx, serve an HTML page
# that processes the session and redirects to the app
from fastapi.responses import HTMLResponse

@app.get("/auth-callback", response_class=HTMLResponse)
@app.get("/api/auth-callback", response_class=HTMLResponse)
async def auth_callback_page(request: Request):
    # Check if there's a native app redirect (for Expo Go / standalone builds)
    app_redirect = request.query_params.get('app_redirect', '')
    
    return HTMLResponse(content=f"""<!DOCTYPE html>
<html><head><title>Signing in...</title>
<style>body{{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}}
.spinner{{border:4px solid #ddd;border-top:4px solid #2E7D32;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite}}
@keyframes spin{{to{{transform:rotate(360deg)}}}}
p{{margin-top:16px;color:#666;font-size:16px}}</style></head>
<body><div class="spinner"></div><p id="status">Completing sign in...</p>
<script>
(async()=>{{
  const hash=window.location.hash;
  let sid=null;
  if(hash){{const m=hash.match(/session_id=([^&]+)/);if(m)sid=m[1];}}
  if(!sid){{const p=new URLSearchParams(window.location.search);sid=p.get('session_id');}}
  const appRedirect='{app_redirect}';
  if(sid && appRedirect){{
    // Native app flow: redirect back to the app with session_id
    document.getElementById('status').textContent='Redirecting to app...';
    const sep=appRedirect.includes('?')?'&':'?';
    window.location.replace(appRedirect+sep+'session_id='+sid);
    return;
  }}
  if(sid){{
    document.getElementById('status').textContent='Authenticating...';
    try{{
      const r=await fetch('/api/auth/session',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{session_id:sid}})}});
      if(r.ok){{
        const d=await r.json();
        localStorage.setItem('auth_token',d.token||d.access_token||'');
        localStorage.setItem('user',JSON.stringify(d.user||d));
        document.getElementById('status').textContent='Success! Redirecting...';
        window.location.replace('/');
      }}else{{document.getElementById('status').textContent='Auth failed. Redirecting...';setTimeout(()=>window.location.replace('/'),1500);}}
    }}catch(e){{document.getElementById('status').textContent='Error. Redirecting...';setTimeout(()=>window.location.replace('/'),1500);}}
  }}else{{document.getElementById('status').textContent='No session found. Redirecting...';setTimeout(()=>window.location.replace('/'),1500);}}
}})();
</script></body></html>""", status_code=200)

# Socket.IO for real-time chat
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Auth callback on the API router (K8s routes /api/* to backend)
@api_router.get("/auth-callback", response_class=HTMLResponse)
async def auth_callback_api():
    return await auth_callback_page()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    bio: Optional[str] = None
    created_at: datetime
    followers_count: int = 0
    following_count: int = 0
    movies_count: int = 0

class MovieAdd(BaseModel):
    tmdb_id: int
    title: str
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    release_date: Optional[str] = None
    overview: Optional[str] = None
    vote_average: Optional[float] = None
    genres: List[str] = []
    user_rating: float = 7.0  # Default rating is 7
    user_review: Optional[str] = None
    private_notes: Optional[str] = None
    watch_link: Optional[str] = None
    imdb_id: Optional[str] = None
    director: Optional[str] = None

class MovieRating(BaseModel):
    rating: float = Field(ge=0, le=10)
    review: Optional[str] = None
    private_notes: Optional[str] = None
    watch_link: Optional[str] = None

class WatchlistAdd(BaseModel):
    tmdb_id: int
    title: str
    poster_path: Optional[str] = None
    release_date: Optional[str] = None
    overview: Optional[str] = None
    vote_average: Optional[float] = None
    imdb_id: Optional[str] = None

class MovieInLibrary(BaseModel):
    id: str
    user_id: str
    tmdb_id: int
    title: str
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    release_date: Optional[str] = None
    overview: Optional[str] = None
    vote_average: Optional[float] = None
    genres: List[str] = []
    user_rating: Optional[float] = None
    user_review: Optional[str] = None
    private_notes: Optional[str] = None
    watch_link: Optional[str] = None
    imdb_id: Optional[str] = None
    added_at: datetime
    watched_at: Optional[datetime] = None

class RecommendationCreate(BaseModel):
    to_user_id: str
    tmdb_id: int
    title: str
    poster_path: Optional[str] = None
    message: Optional[str] = None

class StreamingLinkAdd(BaseModel):
    url: str
    label: Optional[str] = None  # e.g., "Free on Tubi", "My link"

class SeriesAdd(BaseModel):
    tmdb_id: int
    name: str
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    first_air_date: Optional[str] = None
    overview: Optional[str] = None
    vote_average: Optional[float] = None
    genres: List[str] = []
    number_of_seasons: Optional[int] = None
    number_of_episodes: Optional[int] = None
    user_rating: float = 7.0
    user_review: Optional[str] = None
    private_notes: Optional[str] = None
    watch_link: Optional[str] = None

class SeriesRating(BaseModel):
    rating: float = Field(ge=0, le=10)
    review: Optional[str] = None
    private_notes: Optional[str] = None
    watch_link: Optional[str] = None

class ChatMessage(BaseModel):
    to_user_id: str
    message: str

# ==================== HELPER FUNCTIONS ====================

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

async def get_current_user(request: Request) -> dict:
    # Check Authorization header first
    auth_header = request.headers.get("Authorization")
    token = None
    
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    
    # Then check cookies
    if not token:
        token = request.cookies.get("session_token")
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if it's a session token from Google OAuth
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    
    # Otherwise, try JWT token
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_optional_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_password = get_password_hash(user_data.password)
    
    user_doc = {
        "user_id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "password": hashed_password,
        "picture": None,
        "bio": None,
        "created_at": datetime.now(timezone.utc),
        "followers_count": 0,
        "following_count": 0,
        "movies_count": 0
    }
    
    await db.users.insert_one(user_doc)
    
    # Create JWT token
    token = create_access_token({"sub": user_id})
    
    return {
        "token": token,
        "user": {
            "user_id": user_id,
            "email": user_data.email,
            "name": user_data.name,
            "picture": None,
            "bio": None,
            "created_at": user_doc["created_at"].isoformat(),
            "followers_count": 0,
            "following_count": 0,
            "movies_count": 0
        }
    }

@api_router.post("/auth/login")
async def login(user_data: UserLogin):
    user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not user.get("password"):
        raise HTTPException(status_code=401, detail="Please use Google login for this account")
    
    if not verify_password(user_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_access_token({"sub": user["user_id"]})
    
    user_response = {k: v for k, v in user.items() if k != "password"}
    if isinstance(user_response.get("created_at"), datetime):
        user_response["created_at"] = user_response["created_at"].isoformat()
    
    return {"token": token, "user": user_response}

@api_router.post("/auth/session")
async def process_session(request: Request, response: Response):
    """Process Google OAuth session_id and create session"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth to get user data
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        
        auth_data = auth_response.json()
    
    email = auth_data.get("email")
    name = auth_data.get("name")
    picture = auth_data.get("picture")
    session_token = auth_data.get("session_token")
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user data if needed
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "bio": None,
            "created_at": datetime.now(timezone.utc),
            "followers_count": 0,
            "following_count": 0,
            "movies_count": 0
        }
        await db.users.insert_one(user_doc)
    
    # Store session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Get updated user
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    user_response = {k: v for k, v in user.items() if k != "password"}
    if isinstance(user_response.get("created_at"), datetime):
        user_response["created_at"] = user_response["created_at"].isoformat()
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7*24*60*60
    )
    
    return {"token": session_token, "user": user_response}

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    user_response = {k: v for k, v in user.items() if k != "password"}
    if isinstance(user_response.get("created_at"), datetime):
        user_response["created_at"] = user_response["created_at"].isoformat()
    return user_response

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

# ==================== MOVIE SEARCH ENDPOINTS ====================

@api_router.get("/movies/search")
async def search_movies(query: str, page: int = 1, lang: str = "en"):
    """Search movies using TMDB API"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{TMDB_BASE_URL}/search/movie",
            params={
                "api_key": TMDB_API_KEY,
                "query": query,
                "page": page,
                "include_adult": False,
                "language": lang
            }
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to search movies")
        
        return response.json()

@api_router.get("/movies/popular")
async def get_popular_movies(page: int = 1, lang: str = "en"):
    """Get popular movies from TMDB"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{TMDB_BASE_URL}/movie/popular",
            params={"api_key": TMDB_API_KEY, "page": page, "language": lang}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch popular movies")
        
        return response.json()

@api_router.get("/movies/trending")
async def get_trending_movies(lang: str = "en"):
    """Get trending movies from TMDB"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{TMDB_BASE_URL}/trending/movie/week",
            params={"api_key": TMDB_API_KEY, "language": lang}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch trending movies")
        
        return response.json()

@api_router.get("/movies/community-trending")
async def get_community_trending(lang: str = "en"):
    """Get movies rated highest by platform users (Trending Now)"""
    try:
        # First, try to get movies rated in the last 24 hours as hero candidates
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Aggregate all rated movies, group by tmdb_id, compute average and collect raters
        pipeline = [
            {"$match": {"user_rating": {"$ne": None}}},
            {"$sort": {"user_rating": -1}},
            {"$lookup": {
                "from": "users",
                "localField": "user_id",
                "foreignField": "user_id",
                "as": "rater_info"
            }},
            {"$unwind": {"path": "$rater_info", "preserveNullAndEmptyArrays": True}},
            {"$group": {
                "_id": "$tmdb_id",
                "tmdb_id": {"$first": "$tmdb_id"},
                "title": {"$first": "$title"},
                "poster_path": {"$first": "$poster_path"},
                "backdrop_path": {"$first": "$backdrop_path"},
                "release_date": {"$first": "$release_date"},
                "overview": {"$first": "$overview"},
                "vote_average": {"$first": "$vote_average"},
                "frgm_average": {"$avg": "$user_rating"},
                "frgm_count": {"$sum": 1},
                "highest_rating": {"$max": "$user_rating"},
                "latest_rated_at": {"$max": "$added_at"},
                "ratings": {"$push": {
                    "user_id": "$user_id",
                    "user_name": {"$ifNull": ["$rater_info.name", "Anonymous"]},
                    "user_picture": "$rater_info.picture",
                    "rating": "$user_rating",
                    "added_at": "$added_at"
                }}
            }},
            {"$addFields": {
                "frgm_average": {"$round": ["$frgm_average", 1]}
            }},
            # Sort by most recently rated first, then by highest average
            {"$sort": {"latest_rated_at": -1, "frgm_average": -1}},
            {"$limit": 15}
        ]

        results = await db.movie_library.aggregate(pipeline).to_list(15)

        # Clean up results
        for r in results:
            r.pop("_id", None)
            # Sort individual ratings by rating desc
            r["ratings"] = sorted(r.get("ratings", []), key=lambda x: x.get("rating", 0), reverse=True)
            # Convert datetime objects
            for rating in r.get("ratings", []):
                if isinstance(rating.get("added_at"), datetime):
                    rating["added_at"] = rating["added_at"].isoformat()

        return results
    except Exception as e:
        logger.error(f"Community trending error: {e}")
        return []

@api_router.get("/movies/recommendations")
async def get_personalized_recommendations(user: dict = Depends(get_current_user), lang: str = "en"):
    """Get personalized movie recommendations based on user's highest-rated movies"""
    try:
        user_id = user["user_id"]

        # Check for cached recommendations (less than 1 day old)
        cached = await db.recommendations.find_one({
            "user_id": user_id,
            "created_at": {"$gte": datetime.now(timezone.utc) - timedelta(days=1)},
            "lang": lang
        })

        if cached and cached.get("movies") and len(cached["movies"]) > 0:
            return cached["movies"]

        # Get user's top-rated movies, sorted by rating descending, take top 8
        top_movies = await db.movie_library.find(
            {"user_id": user_id, "user_rating": {"$ne": None}},
            {"_id": 0, "tmdb_id": 1, "user_rating": 1, "genres": 1, "title": 1}
        ).sort("user_rating", -1).to_list(8)

        if not top_movies:
            # Fallback: use TMDB popular if user has no rated movies
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{TMDB_BASE_URL}/movie/popular",
                    params={"api_key": TMDB_API_KEY, "page": 1, "language": lang}
                )
                if response.status_code == 200:
                    return response.json().get("results", [])[:10]
            return []

        # Get user's existing library tmdb_ids to filter out
        user_library = await db.movie_library.find(
            {"user_id": user_id},
            {"_id": 0, "tmdb_id": 1}
        ).to_list(1000)
        library_ids = set(m["tmdb_id"] for m in user_library)

        # Also exclude watchlist
        user_watchlist = await db.watchlist.find(
            {"user_id": user_id},
            {"_id": 0, "tmdb_id": 1}
        ).to_list(1000)
        watchlist_ids = set(m["tmdb_id"] for m in user_watchlist)
        exclude_ids = library_ids | watchlist_ids

        # Fetch TMDB recommendations for each top-rated movie
        # Weight by user's rating: higher rated movies contribute more recommendations
        all_recs = []
        seen_ids = set()

        async with httpx.AsyncClient() as client:
            for movie in top_movies:
                try:
                    # Use both recommendations and similar endpoints for variety
                    for endpoint in ["recommendations", "similar"]:
                        response = await client.get(
                            f"{TMDB_BASE_URL}/movie/{movie['tmdb_id']}/{endpoint}",
                            params={"api_key": TMDB_API_KEY, "page": 1, "language": lang}
                        )
                        if response.status_code == 200:
                            recs = response.json().get("results", [])
                            for rec in recs:
                                rec_id = rec.get("id")
                                if rec_id and rec_id not in seen_ids and rec_id not in exclude_ids:
                                    seen_ids.add(rec_id)
                                    # Score: weighted by user's rating of the source movie
                                    rec["_score"] = (movie.get("user_rating", 5) / 10) * rec.get("vote_average", 0)
                                    rec["recommended_because"] = movie.get("title", "")
                                    rec["recommended_because_id"] = movie.get("tmdb_id")
                                    all_recs.append(rec)
                except Exception as e:
                    logger.error(f"TMDB recommendation error for {movie['tmdb_id']}: {e}")
                    continue

        # Sort by weighted score and take top 15
        all_recs.sort(key=lambda x: x.get("_score", 0), reverse=True)
        final_recs = all_recs[:15]

        # Remove internal score field before returning
        for rec in final_recs:
            rec.pop("_score", None)

        # Cache the recommendations
        await db.recommendations.delete_many({"user_id": user_id})
        if final_recs:
            await db.recommendations.insert_one({
                "user_id": user_id,
                "movies": final_recs,
                "lang": lang,
                "created_at": datetime.now(timezone.utc)
            })

        return final_recs
    except Exception as e:
        logger.error(f"Recommendations error: {e}")
        return []


@api_router.get("/movies/top100")
async def get_top100_movies():
    """Get top 100 movies by average FRGM user rating"""
    try:
        pipeline = [
            {"$match": {"user_rating": {"$gt": 0}}},
            {"$group": {
                "_id": "$tmdb_id",
                "avg_rating": {"$avg": "$user_rating"},
                "rating_count": {"$sum": 1},
                "title": {"$first": "$title"},
                "poster_path": {"$first": "$poster_path"},
                "imdb_rating": {"$first": "$imdb_rating"},
                "omdb_rating": {"$first": "$omdb_rating"},
            }},
            {"$sort": {"avg_rating": -1, "rating_count": -1}},
            {"$limit": 100}
        ]
        results = await db.movie_library.aggregate(pipeline).to_list(100)
        
        movies = []
        for i, r in enumerate(results):
            movies.append({
                "rank": i + 1,
                "tmdb_id": r["_id"],
                "title": r.get("title", "Unknown"),
                "poster_path": r.get("poster_path", ""),
                "avg_rating": round(r["avg_rating"], 1),
                "rating_count": r["rating_count"],
                "imdb_rating": r.get("imdb_rating"),
                "omdb_rating": r.get("omdb_rating"),
            })
        
        # Enrich with IMDB/OMDB ratings from TMDB
        tmdb_key = os.environ.get("TMDB_API_KEY", "")
        omdb_key = os.environ.get("OMDB_API_KEY", "")
        if tmdb_key:
            async with httpx.AsyncClient() as c:
                for movie in movies:
                    if not movie.get("imdb_rating"):
                        try:
                            resp = await c.get(
                                f"https://api.themoviedb.org/3/movie/{movie['tmdb_id']}",
                                params={"api_key": tmdb_key},
                                timeout=5
                            )
                            if resp.status_code == 200:
                                tmdb_data = resp.json()
                                # TMDB vote_average as second rating (red star)
                                va = tmdb_data.get("vote_average")
                                if va and va > 0:
                                    movie["omdb_rating"] = round(float(va), 1)
                                imdb_id = tmdb_data.get("imdb_id")
                                # Fetch IMDB rating from OMDB
                                if imdb_id and omdb_key:
                                    try:
                                        omdb_resp = await c.get(
                                            f"http://www.omdbapi.com/",
                                            params={"i": imdb_id, "apikey": omdb_key},
                                            timeout=5
                                        )
                                        if omdb_resp.status_code == 200:
                                            omdb_data = omdb_resp.json()
                                            if omdb_data.get("imdbRating") and omdb_data["imdbRating"] != "N/A":
                                                movie["imdb_rating"] = float(omdb_data["imdbRating"])
                                    except:
                                        pass
                        except:
                            pass
        return movies
    except Exception as e:
        logger.error(f"Top 100 error: {e}")
        return []


@api_router.get("/movies/{tmdb_id}")
async def get_movie_details(tmdb_id: int, request: Request, lang: str = "en"):
    """Get detailed info for a movie including OMDB ratings and FRGM average"""
    async with httpx.AsyncClient() as client:
        # Get TMDB data with language support
        response = await client.get(
            f"{TMDB_BASE_URL}/movie/{tmdb_id}",
            params={"api_key": TMDB_API_KEY, "append_to_response": "credits,videos,watch/providers", "language": lang}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=404, detail="Movie not found")
        
        movie_data = response.json()
        
        # Get OMDB data for additional ratings
        omdb_rating = None
        imdb_rating = None
        imdb_id = movie_data.get("imdb_id")
        
        # Get TMDB vote_average as the second rating (matches original frog-ram.com red star)
        tmdb_vote = movie_data.get("vote_average")
        if tmdb_vote and tmdb_vote > 0:
            omdb_rating = round(float(tmdb_vote), 1)
        
        if imdb_id:
            try:
                omdb_response = await client.get(
                    OMDB_BASE_URL,
                    params={"apikey": OMDB_API_KEY, "i": imdb_id}
                )
                if omdb_response.status_code == 200:
                    omdb_data = omdb_response.json()
                    if omdb_data.get("Response") == "True":
                        # IMDB rating
                        if omdb_data.get("imdbRating") and omdb_data["imdbRating"] != "N/A":
                            imdb_rating = float(omdb_data["imdbRating"])
            except Exception as e:
                logger.error(f"OMDB API error: {e}")
        
        # Calculate FRGM average rating from all users
        frgm_ratings = await db.movie_library.find(
            {"tmdb_id": tmdb_id, "user_rating": {"$ne": None}},
            {"user_rating": 1}
        ).to_list(1000)
        
        frgm_average = None
        frgm_count = len(frgm_ratings)
        if frgm_count > 0:
            total = sum(r["user_rating"] for r in frgm_ratings)
            frgm_average = round(total / frgm_count, 1)
        
        # Add ratings to response
        movie_data["imdb_rating"] = imdb_rating
        movie_data["omdb_rating"] = omdb_rating
        movie_data["frgm_rating"] = frgm_average
        movie_data["frgm_count"] = frgm_count
        
        # Get trailer - search with broader criteria and language fallback
        trailer = None
        videos = movie_data.get("videos", {}).get("results", [])
        
        # Priority order: Trailer > Teaser > Clip > Featurette
        def find_best_video(video_list):
            for vtype in ["Trailer", "Teaser", "Clip", "Featurette"]:
                for video in video_list:
                    if video.get("type") == vtype and video.get("site") == "YouTube":
                        return f"https://www.youtube.com/watch?v={video['key']}"
            return None
        
        trailer = find_best_video(videos)
        
        # If no video found and language is not English, try English fallback
        if not trailer and lang != "en":
            try:
                en_videos_resp = await client.get(
                    f"{TMDB_BASE_URL}/movie/{tmdb_id}/videos",
                    params={"api_key": TMDB_API_KEY, "language": "en"}
                )
                if en_videos_resp.status_code == 200:
                    en_videos = en_videos_resp.json().get("results", [])
                    trailer = find_best_video(en_videos)
            except Exception:
                pass
        
        movie_data["trailer_url"] = trailer
        
        # Get watch providers
        watch_providers = movie_data.get("watch/providers", {}).get("results", {})
        movie_data["watch_providers"] = watch_providers
        
        return movie_data

# ==================== LIBRARY ENDPOINTS ====================

@api_router.post("/library/add")
async def add_to_library(movie: MovieAdd, user: dict = Depends(get_current_user)):
    """Add a movie to user's library"""
    # Check if already in library
    existing = await db.movie_library.find_one({
        "user_id": user["user_id"],
        "tmdb_id": movie.tmdb_id
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Movie already in library")
    
    # Remove from watchlist if present
    await db.watchlist.delete_one({
        "user_id": user["user_id"],
        "tmdb_id": movie.tmdb_id
    })
    
    movie_doc = {
        "id": f"lib_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "tmdb_id": movie.tmdb_id,
        "title": movie.title,
        "poster_path": movie.poster_path,
        "backdrop_path": movie.backdrop_path,
        "release_date": movie.release_date,
        "overview": movie.overview,
        "vote_average": movie.vote_average,
        "genres": movie.genres,
        "user_rating": movie.user_rating if movie.user_rating else 7.0,  # Default 7
        "user_review": movie.user_review,
        "private_notes": movie.private_notes,
        "watch_link": movie.watch_link,
        "imdb_id": movie.imdb_id,
        "director": movie.director,
        "added_at": datetime.now(timezone.utc),
        "watched_at": datetime.now(timezone.utc)
    }
    
    await db.movie_library.insert_one(movie_doc)
    
    # Update user's movie count
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$inc": {"movies_count": 1}}
    )
    
    movie_doc.pop("_id", None)
    if isinstance(movie_doc.get("added_at"), datetime):
        movie_doc["added_at"] = movie_doc["added_at"].isoformat()
    if isinstance(movie_doc.get("watched_at"), datetime):
        movie_doc["watched_at"] = movie_doc["watched_at"].isoformat()
    
    return movie_doc

@api_router.get("/library")
async def get_library(user: dict = Depends(get_current_user)):
    """Get user's movie library with IMDB/OMDB ratings"""
    movies = await db.movie_library.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("added_at", -1).to_list(1000)

    # Enrich movies missing IMDB/OMDB ratings or director (batch, max 20 per request)
    enriched = 0
    async with httpx.AsyncClient() as client:
        for movie in movies:
            needs_ratings = movie.get("imdb_rating") is None and movie.get("omdb_rating") is None
            needs_director = not movie.get("director")
            if (needs_ratings or needs_director) and enriched < 20:
                tmdb_id = movie.get("tmdb_id")
                if tmdb_id:
                    try:
                        # Backfill director from TMDB credits if missing
                        if needs_director:
                            try:
                                credits_resp = await client.get(
                                    f"{TMDB_BASE_URL}/movie/{tmdb_id}/credits",
                                    params={"api_key": TMDB_API_KEY}
                                )
                                if credits_resp.status_code == 200:
                                    crew = credits_resp.json().get("crew", [])
                                    dir_entry = next((c for c in crew if c.get("job") == "Director"), None)
                                    if dir_entry:
                                        movie["director"] = dir_entry["name"]
                                        await db.movie_library.update_one(
                                            {"user_id": user["user_id"], "tmdb_id": tmdb_id},
                                            {"$set": {"director": dir_entry["name"]}}
                                        )
                            except Exception as de:
                                print(f"Error fetching director for {movie.get('title')}: {de}")

                        # Get IMDB ID from TMDB
                        imdb_id = movie.get("imdb_id")
                        if not imdb_id:
                            resp = await client.get(
                                f"https://api.themoviedb.org/3/movie/{tmdb_id}/external_ids",
                                params={"api_key": TMDB_API_KEY}
                            )
                            if resp.status_code == 200:
                                imdb_id = resp.json().get("imdb_id")

                        imdb_rating = None
                        omdb_rating = None

                        # Get TMDB vote_average as second rating (matches original frog-ram.com)
                        try:
                            tmdb_resp = await client.get(
                                f"https://api.themoviedb.org/3/movie/{tmdb_id}",
                                params={"api_key": TMDB_API_KEY}
                            )
                            if tmdb_resp.status_code == 200:
                                tmdb_data = tmdb_resp.json()
                                va = tmdb_data.get("vote_average")
                                if va and va > 0:
                                    omdb_rating = round(float(va), 1)
                        except:
                            pass

                        if imdb_id and OMDB_API_KEY:
                            omdb_resp = await client.get(
                                f"http://www.omdbapi.com/",
                                params={"i": imdb_id, "apikey": OMDB_API_KEY}
                            )
                            if omdb_resp.status_code == 200:
                                omdb_data = omdb_resp.json()
                                if omdb_data.get("Response") == "True":
                                    try:
                                        imdb_rating = float(omdb_data.get("imdbRating", "0"))
                                    except:
                                        pass

                        update = {}
                        if imdb_rating:
                            update["imdb_rating"] = imdb_rating
                            movie["imdb_rating"] = imdb_rating
                        if omdb_rating:
                            update["omdb_rating"] = omdb_rating
                            movie["omdb_rating"] = omdb_rating
                        if imdb_id and not movie.get("imdb_id"):
                            update["imdb_id"] = imdb_id

                        if update:
                            await db.movie_library.update_one(
                                {"user_id": user["user_id"], "tmdb_id": tmdb_id},
                                {"$set": update}
                            )
                        enriched += 1
                    except Exception as e:
                        print(f"Error enriching library movie {movie.get('title')}: {e}")

    for movie in movies:
        if isinstance(movie.get("added_at"), datetime):
            movie["added_at"] = movie["added_at"].isoformat()
        if isinstance(movie.get("watched_at"), datetime):
            movie["watched_at"] = movie["watched_at"].isoformat()

    return movies

@api_router.get("/library/user/{user_id}")
async def get_user_library(user_id: str, request: Request):
    """Get another user's movie library (public)"""
    movies = await db.movie_library.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("added_at", -1).to_list(1000)
    
    for movie in movies:
        if isinstance(movie.get("added_at"), datetime):
            movie["added_at"] = movie["added_at"].isoformat()
        if isinstance(movie.get("watched_at"), datetime):
            movie["watched_at"] = movie["watched_at"].isoformat()
    
    return movies

@api_router.put("/library/{movie_id}/rate")
async def rate_movie(movie_id: str, rating_data: MovieRating, user: dict = Depends(get_current_user)):
    """Rate and review a movie in library"""
    update_data = {
        "user_rating": rating_data.rating,
        "watched_at": datetime.now(timezone.utc)
    }
    
    if rating_data.review is not None:
        update_data["user_review"] = rating_data.review
    if rating_data.private_notes is not None:
        update_data["private_notes"] = rating_data.private_notes
    if rating_data.watch_link is not None:
        update_data["watch_link"] = rating_data.watch_link
    
    result = await db.movie_library.update_one(
        {"id": movie_id, "user_id": user["user_id"]},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Movie not found in library")
    
    # Get updated movie
    updated_movie = await db.movie_library.find_one(
        {"id": movie_id},
        {"_id": 0}
    )
    
    if isinstance(updated_movie.get("added_at"), datetime):
        updated_movie["added_at"] = updated_movie["added_at"].isoformat()
    if isinstance(updated_movie.get("watched_at"), datetime):
        updated_movie["watched_at"] = updated_movie["watched_at"].isoformat()
    
    return updated_movie

@api_router.delete("/library/{movie_id}")
async def remove_from_library(movie_id: str, user: dict = Depends(get_current_user)):
    """Remove a movie from library"""
    result = await db.movie_library.delete_one({
        "id": movie_id,
        "user_id": user["user_id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Movie not found in library")
    
    # Update user's movie count
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$inc": {"movies_count": -1}}
    )
    
    return {"message": "Movie removed from library"}

@api_router.get("/library/check/{tmdb_id}")
async def check_in_library(tmdb_id: int, user: dict = Depends(get_current_user)):
    """Check if a movie is in user's library"""
    movie = await db.movie_library.find_one(
        {"user_id": user["user_id"], "tmdb_id": tmdb_id},
        {"_id": 0}
    )
    return {"in_library": movie is not None, "movie": movie}

@api_router.get("/library/search")
async def search_library(
    q: str = "",
    filter_by: str = "all",
    user: dict = Depends(get_current_user)
):
    """Search user's library by director, actor, country, or all fields"""
    movies = await db.movie_library.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("added_at", -1).to_list(1000)

    if not q:
        for movie in movies:
            if isinstance(movie.get("added_at"), datetime):
                movie["added_at"] = movie["added_at"].isoformat()
            if isinstance(movie.get("watched_at"), datetime):
                movie["watched_at"] = movie["watched_at"].isoformat()
        return movies

    # Enrich movies that don't have director/cast/country data
    enriched_count = 0
    for movie in movies:
        if not movie.get("director") or not movie.get("cast") or not movie.get("production_countries"):
            try:
                tmdb_id = movie.get("tmdb_id")
                if tmdb_id:
                    resp = await http_client.get(
                        f"https://api.themoviedb.org/3/movie/{tmdb_id}",
                        params={"api_key": TMDB_API_KEY, "append_to_response": "credits"},
                        timeout=5
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        credits = data.get("credits", {})
                        directors = [c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"]
                        cast_names = [c["name"] for c in credits.get("cast", [])[:10]]
                        countries = [c["name"] for c in data.get("production_countries", [])]
                        movie["director"] = ", ".join(directors) if directors else ""
                        movie["cast"] = cast_names
                        movie["production_countries"] = countries
                        await db.movie_library.update_one(
                            {"user_id": user["user_id"], "tmdb_id": tmdb_id},
                            {"$set": {
                                "director": movie["director"],
                                "cast": movie["cast"],
                                "production_countries": movie["production_countries"]
                            }}
                        )
                        enriched_count += 1
            except Exception as e:
                print(f"Error enriching movie {movie.get('title')}: {e}")

    # Filter based on search criteria
    query_lower = q.lower()
    results = []
    for movie in movies:
        match = False
        if filter_by in ("all", "director"):
            if movie.get("director") and query_lower in movie["director"].lower():
                match = True
        if filter_by in ("all", "actor"):
            cast_list = movie.get("cast", [])
            if any(query_lower in actor.lower() for actor in cast_list):
                match = True
        if filter_by in ("all", "country"):
            countries = movie.get("production_countries", [])
            if any(query_lower in country.lower() for country in countries):
                match = True
        if filter_by == "all":
            if movie.get("title") and query_lower in movie["title"].lower():
                match = True
        if match:
            results.append(movie)

    for movie in results:
        if isinstance(movie.get("added_at"), datetime):
            movie["added_at"] = movie["added_at"].isoformat()
        if isinstance(movie.get("watched_at"), datetime):
            movie["watched_at"] = movie["watched_at"].isoformat()

    return results


@api_router.get("/library/export-image")
async def export_library_image(user: dict = Depends(get_current_user)):
    """Generate a frog's eye view image of user's entire library - tiny posters in a grid"""
    from PIL import Image as PILImage, ImageDraw, ImageFont
    import io

    movies = await db.movie_library.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("added_at", -1).to_list(500)

    if not movies:
        raise HTTPException(status_code=404, detail="Library is empty")

    # Grid settings for tiny posters
    poster_w, poster_h = 60, 90
    gap = 4
    padding = 20
    header_h = 60
    cols = 10
    rows = (len(movies) + cols - 1) // cols
    img_w = padding * 2 + cols * poster_w + (cols - 1) * gap
    img_h = padding + header_h + rows * poster_h + (rows - 1) * gap + padding

    canvas = PILImage.new("RGB", (img_w, img_h), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)

    # Header
    try:
        font = _load_font(22, bold=True)
        font_small = _load_font(14, bold=False)
    except:
        font = ImageFont.load_default()
        font_small = font

    user_data = await db.users.find_one({"user_id": user["user_id"]})
    user_name = user_data.get("name", "User") if user_data else "User"
    draw.text((padding, padding), f"FROGRAM - {user_name}'s Library", fill=(46, 125, 50), font=font)
    draw.text((padding, padding + 30), f"{len(movies)} movies", fill=(100, 100, 100), font=font_small)

    # Draw tiny posters
    for idx, movie in enumerate(movies):
        col = idx % cols
        row = idx // cols
        x = padding + col * (poster_w + gap)
        y = padding + header_h + row * (poster_h + gap)

        poster_path = movie.get("poster_path")
        if poster_path:
            try:
                poster_url = f"https://image.tmdb.org/t/p/w92{poster_path}"
                resp = await http_client.get(poster_url)
                if resp.status_code == 200:
                    poster_img = PILImage.open(io.BytesIO(resp.content))
                    poster_img = poster_img.resize((poster_w, poster_h), PILImage.LANCZOS)
                    canvas.paste(poster_img, (x, y))
                    continue
            except:
                pass
        # Fallback: gray rectangle with title
        draw.rectangle([x, y, x + poster_w, y + poster_h], fill=(220, 220, 220))

    # Save to buffer
    buffer = io.BytesIO()
    canvas.save(buffer, format="JPEG", quality=85)
    buffer.seek(0)

    return StreamingResponse(buffer, media_type="image/jpeg",
        headers={"Content-Disposition": f"attachment; filename=frogram_library.jpg"})


@api_router.get("/library/export-list")
async def export_library_list(user: dict = Depends(get_current_user)):
    """Generate a text list of user's library with title, director, rating"""
    movies = await db.movie_library.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("added_at", -1).to_list(500)

    if not movies:
        raise HTTPException(status_code=404, detail="Library is empty")

    # Enrich missing director data
    for movie in movies:
        if not movie.get("director"):
            try:
                tmdb_id = movie.get("tmdb_id")
                if tmdb_id:
                    resp = await http_client.get(
                        f"https://api.themoviedb.org/3/movie/{tmdb_id}",
                        params={"api_key": TMDB_API_KEY, "append_to_response": "credits"}
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        credits = data.get("credits", {})
                        directors = [c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"]
                        movie["director"] = ", ".join(directors) if directors else "N/A"
                        await db.movie_library.update_one(
                            {"user_id": user["user_id"], "tmdb_id": tmdb_id},
                            {"$set": {"director": movie["director"]}}
                        )
            except:
                movie["director"] = "N/A"

    user_data = await db.users.find_one({"user_id": user["user_id"]})
    user_name = user_data.get("name", "User") if user_data else "User"

    lines = [f"🎬 FROGRAM - {user_name}'s Library ({len(movies)} movies)\n"]
    lines.append("=" * 50)
    for idx, movie in enumerate(movies, 1):
        title = movie.get("title", "Unknown")
        director = movie.get("director", "N/A")
        rating = movie.get("user_rating")
        rating_str = f"⭐ {rating:.1f}" if rating else "Not rated"
        year = ""
        if movie.get("release_date"):
            try:
                year = f" ({movie['release_date'][:4]})"
            except:
                pass
        lines.append(f"{idx}. {title}{year}")
        lines.append(f"   Director: {director} | {rating_str}")
    lines.append("=" * 50)
    lines.append("Powered by FROGRAM 🐸")

    return {"text": "\n".join(lines)}



# ==================== SOCIAL ENDPOINTS ====================

@api_router.get("/users/search")
async def search_users(query: str, user: dict = Depends(get_current_user)):
    """Search for users by name or email"""
    users = await db.users.find(
        {
            "$and": [
                {"user_id": {"$ne": user["user_id"]}},
                {"$or": [
                    {"name": {"$regex": query, "$options": "i"}},
                    {"email": {"$regex": query, "$options": "i"}}
                ]}
            ]
        },
        {"_id": 0, "password": 0}
    ).limit(20).to_list(20)
    
    for u in users:
        if isinstance(u.get("created_at"), datetime):
            u["created_at"] = u["created_at"].isoformat()
    
    return users

@api_router.get("/users/suggestions")
async def get_user_suggestions(user: dict = Depends(get_current_user)):
    """Suggest users to follow based on similar movie taste"""
    try:
        user_id = user["user_id"]
        my_movies = await db.movie_library.find(
            {"user_id": user_id, "user_rating": {"$gte": 7}},
            {"_id": 0, "tmdb_id": 1}
        ).to_list(50)
        my_tmdb_ids = [m["tmdb_id"] for m in my_movies]

        if not my_tmdb_ids:
            my_movies = await db.movie_library.find(
                {"user_id": user_id}, {"_id": 0, "tmdb_id": 1}
            ).to_list(50)
            my_tmdb_ids = [m["tmdb_id"] for m in my_movies]

        follows = await db.follows.find(
            {"follower_id": user_id}, {"_id": 0, "following_id": 1}
        ).to_list(1000)
        following_ids = set(f["following_id"] for f in follows)
        following_ids.add(user_id)

        if not my_tmdb_ids:
            all_users = await db.users.find(
                {"user_id": {"$nin": list(following_ids)}},
                {"_id": 0, "password": 0}
            ).to_list(10)
            for u in all_users:
                u["common_movies"] = 0
                if isinstance(u.get("created_at"), datetime):
                    u["created_at"] = u["created_at"].isoformat()
            return all_users

        pipeline = [
            {"$match": {
                "tmdb_id": {"$in": my_tmdb_ids},
                "user_id": {"$nin": list(following_ids)},
                "user_rating": {"$gte": 6.5}
            }},
            {"$group": {
                "_id": "$user_id",
                "common_movies": {"$sum": 1},
                "avg_rating": {"$avg": "$user_rating"}
            }},
            {"$sort": {"common_movies": -1, "avg_rating": -1}},
            {"$limit": 10}
        ]
        similar_users = await db.movie_library.aggregate(pipeline).to_list(10)
        
        if similar_users:
            user_ids = [u["_id"] for u in similar_users]
            users_data = await db.users.find(
                {"user_id": {"$in": user_ids}}, {"_id": 0, "password": 0}
            ).to_list(10)
            user_map = {u["user_id"]: u for u in users_data}
            common_map = {u["_id"]: u["common_movies"] for u in similar_users}

            results = []
            for uid in user_ids:
                if uid in user_map:
                    u = user_map[uid]
                    u["common_movies"] = common_map.get(uid, 0)
                    if isinstance(u.get("created_at"), datetime):
                        u["created_at"] = u["created_at"].isoformat()
                    results.append(u)
            return results
        
        # Fallback: suggest active users not yet followed
        all_users = await db.users.find(
            {"user_id": {"$nin": list(following_ids)}},
            {"_id": 0, "password": 0}
        ).sort("movies_count", -1).to_list(10)
        for u in all_users:
            u["common_movies"] = 0
            if isinstance(u.get("created_at"), datetime):
                u["created_at"] = u["created_at"].isoformat()
        return all_users
    except Exception as e:
        logger.error(f"User suggestions error: {e}")
        return []

@api_router.get("/users/{user_id}")
async def get_user_profile(user_id: str):
    """Get user profile by ID"""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if isinstance(user.get("created_at"), datetime):
        user["created_at"] = user["created_at"].isoformat()
    
    return user

@api_router.post("/users/{user_id}/follow")
async def follow_user(user_id: str, user: dict = Depends(get_current_user)):
    """Follow a user"""
    if user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
    
    # Check if target user exists
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already following
    existing = await db.follows.find_one({
        "follower_id": user["user_id"],
        "following_id": user_id
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Already following this user")
    
    # Create follow relationship
    await db.follows.insert_one({
        "id": f"follow_{uuid.uuid4().hex[:12]}",
        "follower_id": user["user_id"],
        "following_id": user_id,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Update counts
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"following_count": 1}})
    await db.users.update_one({"user_id": user_id}, {"$inc": {"followers_count": 1}})
    
    return {"message": "Now following user"}

@api_router.delete("/users/{user_id}/follow")
async def unfollow_user(user_id: str, user: dict = Depends(get_current_user)):
    """Unfollow a user"""
    result = await db.follows.delete_one({
        "follower_id": user["user_id"],
        "following_id": user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=400, detail="Not following this user")
    
    # Update counts
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"following_count": -1}})
    await db.users.update_one({"user_id": user_id}, {"$inc": {"followers_count": -1}})
    
    return {"message": "Unfollowed user"}

@api_router.get("/users/{user_id}/follow-status")
async def get_follow_status(user_id: str, user: dict = Depends(get_current_user)):
    """Check if current user is following another user"""
    follow = await db.follows.find_one({
        "follower_id": user["user_id"],
        "following_id": user_id
    })
    return {"is_following": follow is not None}

@api_router.get("/followers")
async def get_followers(user: dict = Depends(get_current_user)):
    """Get list of followers"""
    follows = await db.follows.find(
        {"following_id": user["user_id"]},
        {"_id": 0}
    ).to_list(1000)
    
    follower_ids = [f["follower_id"] for f in follows]
    
    followers = await db.users.find(
        {"user_id": {"$in": follower_ids}},
        {"_id": 0, "password": 0}
    ).to_list(1000)
    
    for f in followers:
        if isinstance(f.get("created_at"), datetime):
            f["created_at"] = f["created_at"].isoformat()
    
    return followers

@api_router.get("/following")
async def get_following(user: dict = Depends(get_current_user)):
    """Get list of users being followed"""
    follows = await db.follows.find(
        {"follower_id": user["user_id"]},
        {"_id": 0}
    ).to_list(1000)
    
    following_ids = [f["following_id"] for f in follows]
    
    following = await db.users.find(
        {"user_id": {"$in": following_ids}},
        {"_id": 0, "password": 0}
    ).to_list(1000)
    
    for f in following:
        if isinstance(f.get("created_at"), datetime):
            f["created_at"] = f["created_at"].isoformat()
    
    return following

# ==================== RECOMMENDATIONS ENDPOINTS ====================

@api_router.post("/recommendations")
async def send_recommendation(rec: RecommendationCreate, user: dict = Depends(get_current_user)):
    """Send a movie recommendation to another user"""
    # Check if target user exists
    target = await db.users.find_one({"user_id": rec.to_user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    
    rec_doc = {
        "id": f"rec_{uuid.uuid4().hex[:12]}",
        "from_user_id": user["user_id"],
        "from_user_name": user["name"],
        "from_user_picture": user.get("picture"),
        "to_user_id": rec.to_user_id,
        "tmdb_id": rec.tmdb_id,
        "title": rec.title,
        "poster_path": rec.poster_path,
        "message": rec.message,
        "read": False,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.recommendations.insert_one(rec_doc)
    rec_doc.pop("_id", None)
    rec_doc["created_at"] = rec_doc["created_at"].isoformat()
    
    return rec_doc

@api_router.get("/recommendations")
async def get_recommendations(user: dict = Depends(get_current_user)):
    """Get movie recommendations received"""
    recs = await db.recommendations.find(
        {"to_user_id": user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    for r in recs:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    
    return recs

@api_router.put("/recommendations/{rec_id}/read")
async def mark_recommendation_read(rec_id: str, user: dict = Depends(get_current_user)):
    """Mark a recommendation as read"""
    await db.recommendations.update_one(
        {"id": rec_id, "to_user_id": user["user_id"]},
        {"$set": {"read": True}}
    )
    return {"message": "Marked as read"}

# ==================== CHAT ENDPOINTS ====================

@api_router.get("/chats")
async def get_chat_list(user: dict = Depends(get_current_user)):
    """Get list of chat conversations"""
    # Get unique users we've chatted with
    pipeline = [
        {"$match": {
            "$or": [
                {"from_user_id": user["user_id"]},
                {"to_user_id": user["user_id"]}
            ]
        }},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": {
                "$cond": [
                    {"$eq": ["$from_user_id", user["user_id"]]},
                    "$to_user_id",
                    "$from_user_id"
                ]
            },
            "last_message": {"$first": "$message"},
            "last_message_at": {"$first": "$created_at"},
            "unread_count": {
                "$sum": {
                    "$cond": [
                        {"$and": [
                            {"$eq": ["$to_user_id", user["user_id"]]},
                            {"$eq": ["$read", False]}
                        ]},
                        1, 0
                    ]
                }
            }
        }}
    ]
    
    chats = await db.chat_messages.aggregate(pipeline).to_list(100)
    
    # Get user details
    user_ids = [c["_id"] for c in chats]
    users = await db.users.find(
        {"user_id": {"$in": user_ids}},
        {"_id": 0, "password": 0}
    ).to_list(100)
    user_map = {u["user_id"]: u for u in users}
    
    result = []
    for c in chats:
        chat_user = user_map.get(c["_id"], {})
        result.append({
            "user_id": c["_id"],
            "user_name": chat_user.get("name", "Unknown"),
            "user_picture": chat_user.get("picture"),
            "last_message": c["last_message"],
            "last_message_at": c["last_message_at"].isoformat() if isinstance(c["last_message_at"], datetime) else c["last_message_at"],
            "unread_count": c["unread_count"]
        })
    
    return result

@api_router.get("/chats/{user_id}")
async def get_chat_messages(user_id: str, user: dict = Depends(get_current_user)):
    """Get chat messages with a specific user"""
    messages = await db.chat_messages.find(
        {"$or": [
            {"from_user_id": user["user_id"], "to_user_id": user_id},
            {"from_user_id": user_id, "to_user_id": user["user_id"]}
        ]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    
    # Mark messages as read
    await db.chat_messages.update_many(
        {"from_user_id": user_id, "to_user_id": user["user_id"], "read": False},
        {"$set": {"read": True}}
    )
    
    for m in messages:
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
    
    return messages

@api_router.post("/chats/{user_id}")
async def send_chat_message(user_id: str, msg: ChatMessage, user: dict = Depends(get_current_user)):
    """Send a chat message"""
    # Check if target user exists
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    
    message_doc = {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "from_user_id": user["user_id"],
        "from_user_name": user["name"],
        "from_user_picture": user.get("picture"),
        "to_user_id": user_id,
        "message": msg.message,
        "read": False,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.chat_messages.insert_one(message_doc)
    message_doc.pop("_id", None)
    message_doc["created_at"] = message_doc["created_at"].isoformat()
    
    # Emit socket event for real-time
    await sio.emit(f"chat_{user_id}", message_doc)
    
    return message_doc

# ==================== PROFILE ENDPOINTS ====================

@api_router.put("/profile")
async def update_profile(request: Request, user: dict = Depends(get_current_user)):
    """Update user profile"""
    body = await request.json()
    
    update_fields = {}
    if "name" in body:
        update_fields["name"] = body["name"]
    if "bio" in body:
        update_fields["bio"] = body["bio"]
    if "picture" in body:
        update_fields["picture"] = body["picture"]
    
    if update_fields:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": update_fields}
        )
    
    updated_user = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password": 0})
    if isinstance(updated_user.get("created_at"), datetime):
        updated_user["created_at"] = updated_user["created_at"].isoformat()
    
    return updated_user

# ==================== FEED ENDPOINTS ====================

@api_router.get("/feed")
async def get_feed(user: dict = Depends(get_current_user)):
    """Get activity feed from followed users"""
    # Get users being followed
    follows = await db.follows.find(
        {"follower_id": user["user_id"]},
        {"_id": 0}
    ).to_list(1000)
    
    following_ids = [f["following_id"] for f in follows]
    
    if not following_ids:
        return []
    
    # Get recent movies added by followed users
    movies = await db.movie_library.find(
        {"user_id": {"$in": following_ids}},
        {"_id": 0}
    ).sort("added_at", -1).limit(50).to_list(50)
    
    # Get user details
    users = await db.users.find(
        {"user_id": {"$in": following_ids}},
        {"_id": 0, "password": 0}
    ).to_list(1000)
    user_map = {u["user_id"]: u for u in users}
    
    feed = []
    for movie in movies:
        movie_user = user_map.get(movie["user_id"], {})
        feed.append({
            "type": "movie_added",
            "user_id": movie["user_id"],
            "user_name": movie_user.get("name", "Unknown"),
            "user_picture": movie_user.get("picture"),
            "movie": movie,
            "created_at": movie["added_at"].isoformat() if isinstance(movie["added_at"], datetime) else movie["added_at"]
        })
    
    return feed

# ==================== SERIES SEARCH ENDPOINTS ====================

@api_router.get("/series/search")
async def search_series(query: str, page: int = 1, lang: str = "en"):
    """Search TV series using TMDB API"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{TMDB_BASE_URL}/search/tv",
            params={
                "api_key": TMDB_API_KEY,
                "query": query,
                "page": page,
                "include_adult": False,
                "language": lang
            }
        )
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to search series")
        return response.json()

@api_router.get("/series/popular")
async def get_popular_series(page: int = 1, lang: str = "en"):
    """Get popular TV series from TMDB"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{TMDB_BASE_URL}/tv/popular",
            params={"api_key": TMDB_API_KEY, "page": page, "language": lang}
        )
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch popular series")
        return response.json()

@api_router.get("/series/{tmdb_id}")
async def get_series_details(tmdb_id: int, request: Request, lang: str = "en"):
    """Get detailed info for a TV series including ratings"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{TMDB_BASE_URL}/tv/{tmdb_id}",
            params={"api_key": TMDB_API_KEY, "append_to_response": "credits,videos,watch/providers,external_ids", "language": lang}
        )
        if response.status_code != 200:
            raise HTTPException(status_code=404, detail="Series not found")

        series_data = response.json()

        # Get OMDB data for additional ratings
        omdb_rating = None
        imdb_rating = None
        imdb_id = series_data.get("external_ids", {}).get("imdb_id")

        if imdb_id:
            try:
                omdb_response = await client.get(
                    OMDB_BASE_URL,
                    params={"apikey": OMDB_API_KEY, "i": imdb_id}
                )
                if omdb_response.status_code == 200:
                    omdb_data = omdb_response.json()
                    if omdb_data.get("Response") == "True":
                        if omdb_data.get("imdbRating") and omdb_data["imdbRating"] != "N/A":
                            imdb_rating = float(omdb_data["imdbRating"])
                        ratings = omdb_data.get("Ratings", [])
                        for r in ratings:
                            if r.get("Source") == "Rotten Tomatoes":
                                rt_val = r.get("Value", "").replace("%", "")
                                if rt_val:
                                    omdb_rating = float(rt_val) / 10
                                    break
            except Exception as e:
                logger.error(f"OMDB API error for series: {e}")

        # Calculate FRGM average rating
        frgm_ratings = await db.series_library.find(
            {"tmdb_id": tmdb_id, "user_rating": {"$ne": None}},
            {"user_rating": 1}
        ).to_list(1000)

        frgm_average = None
        frgm_count = len(frgm_ratings)
        if frgm_count > 0:
            total = sum(r["user_rating"] for r in frgm_ratings)
            frgm_average = round(total / frgm_count, 1)

        series_data["imdb_rating"] = imdb_rating
        series_data["omdb_rating"] = omdb_rating
        series_data["frgm_rating"] = frgm_average
        series_data["frgm_count"] = frgm_count
        series_data["imdb_id"] = imdb_id

        # Get trailer - search with broader criteria and language fallback
        trailer = None
        videos = series_data.get("videos", {}).get("results", [])
        
        def find_best_video(video_list):
            for vtype in ["Trailer", "Teaser", "Clip", "Featurette"]:
                for video in video_list:
                    if video.get("type") == vtype and video.get("site") == "YouTube":
                        return f"https://www.youtube.com/watch?v={video['key']}"
            return None
        
        trailer = find_best_video(videos)
        
        # If no video found and language is not English, try English fallback
        if not trailer and lang != "en":
            try:
                en_videos_resp = await client.get(
                    f"{TMDB_BASE_URL}/tv/{tmdb_id}/videos",
                    params={"api_key": TMDB_API_KEY, "language": "en"}
                )
                if en_videos_resp.status_code == 200:
                    en_videos = en_videos_resp.json().get("results", [])
                    trailer = find_best_video(en_videos)
            except Exception:
                pass
        
        series_data["trailer_url"] = trailer

        # Get watch providers
        watch_providers = series_data.get("watch/providers", {}).get("results", {})
        series_data["watch_providers"] = watch_providers

        return series_data

# ==================== PERSON/ACTOR/DIRECTOR SEARCH ====================

@api_router.get("/search/person")
async def search_person(query: str, page: int = 1):
    """Search for actors/directors using TMDB API"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{TMDB_BASE_URL}/search/person",
            params={
                "api_key": TMDB_API_KEY,
                "query": query,
                "page": page
            }
        )
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to search person")
        return response.json()

@api_router.get("/person/{person_id}/movies")
async def get_person_movies(person_id: int, lang: str = "en"):
    """Get movie credits for a person (actor or director)"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{TMDB_BASE_URL}/person/{person_id}/movie_credits",
            params={"api_key": TMDB_API_KEY, "language": lang}
        )
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch person movies")

        data = response.json()
        # Combine cast and crew, remove duplicates, sort by popularity
        movies = {}
        for m in data.get("cast", []):
            if m["id"] not in movies:
                movies[m["id"]] = m
        for m in data.get("crew", []):
            if m.get("job") in ["Director", "Producer", "Writer"]:
                if m["id"] not in movies:
                    movies[m["id"]] = m

        sorted_movies = sorted(movies.values(), key=lambda x: x.get("popularity", 0), reverse=True)
        return {"results": sorted_movies[:40]}

@api_router.get("/person/{person_id}/series")
async def get_person_series(person_id: int, lang: str = "en"):
    """Get TV series credits for a person"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{TMDB_BASE_URL}/person/{person_id}/tv_credits",
            params={"api_key": TMDB_API_KEY, "language": lang}
        )
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch person series")

        data = response.json()
        series = {}
        for s in data.get("cast", []):
            if s["id"] not in series:
                series[s["id"]] = s
        for s in data.get("crew", []):
            if s.get("job") in ["Director", "Producer", "Writer", "Creator"]:
                if s["id"] not in series:
                    series[s["id"]] = s

        sorted_series = sorted(series.values(), key=lambda x: x.get("popularity", 0), reverse=True)
        return {"results": sorted_series[:40]}

# ==================== SERIES LIBRARY ENDPOINTS ====================

@api_router.post("/series-library/add")
async def add_to_series_library(series: SeriesAdd, user: dict = Depends(get_current_user)):
    """Add a series to user's library"""
    existing = await db.series_library.find_one({
        "user_id": user["user_id"],
        "tmdb_id": series.tmdb_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Series already in library")

    series_doc = {
        "id": f"slib_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "tmdb_id": series.tmdb_id,
        "name": series.name,
        "poster_path": series.poster_path,
        "backdrop_path": series.backdrop_path,
        "first_air_date": series.first_air_date,
        "overview": series.overview,
        "vote_average": series.vote_average,
        "genres": series.genres,
        "number_of_seasons": series.number_of_seasons,
        "number_of_episodes": series.number_of_episodes,
        "user_rating": series.user_rating if series.user_rating else 7.0,
        "user_review": series.user_review,
        "private_notes": series.private_notes,
        "watch_link": series.watch_link,
        "added_at": datetime.now(timezone.utc),
    }

    await db.series_library.insert_one(series_doc)
    series_doc.pop("_id", None)
    if isinstance(series_doc.get("added_at"), datetime):
        series_doc["added_at"] = series_doc["added_at"].isoformat()
    return series_doc

@api_router.get("/series-library")
async def get_series_library(user: dict = Depends(get_current_user)):
    """Get user's series library"""
    series = await db.series_library.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("added_at", -1).to_list(1000)

    for s in series:
        if isinstance(s.get("added_at"), datetime):
            s["added_at"] = s["added_at"].isoformat()
    return series

@api_router.put("/series-library/{series_id}/rate")
async def rate_series(series_id: str, rating_data: SeriesRating, user: dict = Depends(get_current_user)):
    """Rate and review a series in library"""
    update_data = {"user_rating": rating_data.rating}
    if rating_data.review is not None:
        update_data["user_review"] = rating_data.review
    if rating_data.private_notes is not None:
        update_data["private_notes"] = rating_data.private_notes
    if rating_data.watch_link is not None:
        update_data["watch_link"] = rating_data.watch_link

    result = await db.series_library.update_one(
        {"id": series_id, "user_id": user["user_id"]},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Series not found in library")

    updated = await db.series_library.find_one({"id": series_id}, {"_id": 0})
    if isinstance(updated.get("added_at"), datetime):
        updated["added_at"] = updated["added_at"].isoformat()
    return updated

@api_router.delete("/series-library/{series_id}")
async def remove_from_series_library(series_id: str, user: dict = Depends(get_current_user)):
    """Remove a series from library"""
    result = await db.series_library.delete_one({
        "id": series_id,
        "user_id": user["user_id"]
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Series not found in library")
    return {"message": "Series removed from library"}

@api_router.get("/series-library/check/{tmdb_id}")
async def check_in_series_library(tmdb_id: int, user: dict = Depends(get_current_user)):
    """Check if a series is in user's library"""
    series = await db.series_library.find_one(
        {"user_id": user["user_id"], "tmdb_id": tmdb_id},
        {"_id": 0}
    )
    return {"in_library": series is not None, "series": series}

# ==================== WATCHLIST ====================

@api_router.post("/watchlist/add")
async def add_to_watchlist(data: dict, user: dict = Depends(get_current_user)):
    """Add a movie to user's watchlist (to watch later)"""
    user_id = user["user_id"]
    existing = await db.watchlist.find_one({"user_id": user_id, "tmdb_id": data["tmdb_id"]})
    if existing:
        return {"detail": "Already in watchlist", "id": existing["id"]}
    
    import uuid
    item = {
        "id": f"wl_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "tmdb_id": data["tmdb_id"],
        "title": data.get("title", ""),
        "poster_path": data.get("poster_path", ""),
        "release_date": data.get("release_date", ""),
        "overview": data.get("overview", ""),
        "vote_average": data.get("vote_average", 0),
        "genres": data.get("genres", []),
        "created_at": datetime.now(timezone.utc),
    }
    await db.watchlist.insert_one(item)
    return {"id": item["id"], "message": "Added to watchlist"}

@api_router.get("/watchlist")
async def get_watchlist(user: dict = Depends(get_current_user)):
    """Get user's watchlist, excluding movies already in library, enriched with ratings"""
    user_id = user["user_id"]
    
    # Get user's library tmdb_ids to exclude
    library_items = await db.movie_library.find(
        {"user_id": user_id},
        {"tmdb_id": 1}
    ).to_list(1000)
    library_tmdb_ids = {item["tmdb_id"] for item in library_items}
    
    items = await db.watchlist.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    # Filter out movies already in library and auto-clean
    filtered = []
    remove_ids = []
    for item in items:
        if item["tmdb_id"] in library_tmdb_ids:
            remove_ids.append(item["id"])
        else:
            filtered.append(item)
    
    # Auto-remove library movies from watchlist
    if remove_ids:
        await db.watchlist.delete_many({"id": {"$in": remove_ids}})
    
    # Enrich with IMDB/TMDB ratings
    async with httpx.AsyncClient() as client:
        for item in filtered:
            if not item.get("imdb_rating"):
                try:
                    tmdb_id = item["tmdb_id"]
                    resp = await client.get(
                        f"https://api.themoviedb.org/3/movie/{tmdb_id}",
                        params={"api_key": TMDB_API_KEY},
                        timeout=5
                    )
                    if resp.status_code == 200:
                        tmdb_data = resp.json()
                        va = tmdb_data.get("vote_average")
                        if va and va > 0:
                            item["omdb_rating"] = round(float(va), 1)
                        imdb_id = tmdb_data.get("imdb_id")
                        if imdb_id and OMDB_API_KEY:
                            omdb_resp = await client.get(
                                f"http://www.omdbapi.com/",
                                params={"i": imdb_id, "apikey": OMDB_API_KEY},
                                timeout=5
                            )
                            if omdb_resp.status_code == 200:
                                omdb_data = omdb_resp.json()
                                if omdb_data.get("imdbRating") and omdb_data["imdbRating"] != "N/A":
                                    item["imdb_rating"] = float(omdb_data["imdbRating"])
                    # Update DB with ratings
                    await db.watchlist.update_one(
                        {"id": item["id"]},
                        {"$set": {"imdb_rating": item.get("imdb_rating"), "omdb_rating": item.get("omdb_rating")}}
                    )
                except:
                    pass
    
    return filtered

@api_router.delete("/watchlist/{item_id}")
async def remove_from_watchlist(item_id: str, user: dict = Depends(get_current_user)):
    """Remove a movie from watchlist"""
    result = await db.watchlist.delete_one({"id": item_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found in watchlist")
    return {"message": "Removed from watchlist"}

@api_router.get("/watchlist/check/{tmdb_id}")
async def check_in_watchlist(tmdb_id: int, user: dict = Depends(get_current_user)):
    """Check if a movie is in watchlist"""
    item = await db.watchlist.find_one(
        {"user_id": user["user_id"], "tmdb_id": tmdb_id},
        {"_id": 0}
    )
    return {"in_watchlist": item is not None, "item": item}

# ==================== SERIES WATCHLIST ====================

@api_router.post("/series-watchlist/add")
async def add_series_to_watchlist(data: dict, user: dict = Depends(get_current_user)):
    """Add a series to user's watchlist"""
    user_id = user["user_id"]
    existing = await db.series_watchlist.find_one({"user_id": user_id, "tmdb_id": data["tmdb_id"]})
    if existing:
        return {"detail": "Already in watchlist", "id": existing["id"]}
    
    import uuid
    item = {
        "id": f"swl_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "tmdb_id": data["tmdb_id"],
        "name": data.get("name", ""),
        "poster_path": data.get("poster_path", ""),
        "first_air_date": data.get("first_air_date", ""),
        "overview": data.get("overview", ""),
        "vote_average": data.get("vote_average", 0),
        "number_of_seasons": data.get("number_of_seasons", 0),
        "genres": data.get("genres", []),
        "created_at": datetime.now(timezone.utc),
    }
    await db.series_watchlist.insert_one(item)
    return {"id": item["id"], "message": "Added to watchlist"}

@api_router.get("/series-watchlist")
async def get_series_watchlist(user: dict = Depends(get_current_user)):
    """Get user's series watchlist, excluding series already in library"""
    user_id = user["user_id"]
    
    # Get user's series library tmdb_ids to exclude
    library_items = await db.series_library.find(
        {"user_id": user_id},
        {"tmdb_id": 1}
    ).to_list(1000)
    library_tmdb_ids = {item["tmdb_id"] for item in library_items}
    
    items = await db.series_watchlist.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    # Filter out series already in library
    filtered = []
    remove_ids = []
    for item in items:
        if item["tmdb_id"] in library_tmdb_ids:
            remove_ids.append(item["id"])
        else:
            filtered.append(item)
    
    if remove_ids:
        await db.series_watchlist.delete_many({"id": {"$in": remove_ids}})
    
    return filtered

@api_router.delete("/series-watchlist/{item_id}")
async def remove_series_from_watchlist(item_id: str, user: dict = Depends(get_current_user)):
    """Remove a series from watchlist"""
    result = await db.series_watchlist.delete_one({"id": item_id, "user_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found in watchlist")
    return {"message": "Removed from watchlist"}

@api_router.get("/series-watchlist/check/{tmdb_id}")
async def check_series_in_watchlist(tmdb_id: int, user: dict = Depends(get_current_user)):
    """Check if a series is in watchlist"""
    item = await db.series_watchlist.find_one(
        {"user_id": user["user_id"], "tmdb_id": tmdb_id},
        {"_id": 0}
    )
    return {"in_watchlist": item is not None, "item": item}


# ==================== NOTIFICATIONS ====================

@api_router.get("/notifications/count")
async def get_notification_count(user: dict = Depends(get_current_user)):
    """Get count of unread notifications (new messages, recommendations, follows)"""
    user_id = user["user_id"]
    
    # Get last viewed timestamp
    user_doc = await db.users.find_one({"user_id": user_id})
    last_viewed = user_doc.get("last_viewed_notifications") if user_doc else None
    
    # Count unread chat messages
    msg_filter = {"to_user_id": user_id, "read": {"$ne": True}}
    if last_viewed:
        msg_filter["created_at"] = {"$gt": last_viewed}
    unread_messages = await db.chat_messages.count_documents(msg_filter)
    
    # Count unread recommendations
    rec_filter = {"to_user_id": user_id, "read": {"$ne": True}}
    if last_viewed:
        rec_filter["created_at"] = {"$gt": last_viewed}
    unread_recommendations = await db.recommendations.count_documents(rec_filter)
    
    # Count recent follow requests since last viewed (or last 24h)
    from datetime import timedelta
    cutoff = last_viewed if last_viewed else (datetime.now(timezone.utc) - timedelta(hours=24))
    new_followers = await db.follows.count_documents({
        "following_id": user_id,
        "created_at": {"$gte": cutoff}
    })
    
    total = unread_messages + unread_recommendations + new_followers
    return {
        "count": total,
        "messages": unread_messages,
        "recommendations": unread_recommendations,
        "new_followers": new_followers
    }


@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    """Get all notifications: messages, follow requests, recommendations"""
    user_id = user["user_id"]
    notifications = []

    # Mark notifications as viewed - update last_viewed_notifications timestamp
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"last_viewed_notifications": datetime.now(timezone.utc)}}
    )

    # Recent followers (last 7 days)
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    followers_cursor = db.follows.find({
        "following_id": user_id,
        "created_at": {"$gte": cutoff}
    }).sort("created_at", -1).limit(20)
    async for f in followers_cursor:
        follower = await db.users.find_one({"user_id": f["follower_id"]})
        notifications.append({
            "type": "follow",
            "user_id": f.get("follower_id"),
            "user_name": follower.get("name", "Someone") if follower else "Someone",
            "user_avatar": follower.get("avatar_url") if follower else None,
            "message": f"{follower.get('name', 'Someone') if follower else 'Someone'} started following you",
            "created_at": f.get("created_at", datetime.now(timezone.utc)).isoformat(),
            "read": False,
        })

    # Unread recommendations
    recs_cursor = db.recommendations.find({
        "to_user_id": user_id,
    }).sort("created_at", -1).limit(20)
    async for r in recs_cursor:
        notifications.append({
            "type": "recommendation",
            "id": r.get("id"),
            "user_id": r.get("from_user_id"),
            "user_name": r.get("from_user_name", "Someone"),
            "movie_title": r.get("movie_title", "a movie"),
            "tmdb_id": r.get("tmdb_id"),
            "message": f"{r.get('from_user_name', 'Someone')} recommended {r.get('movie_title', 'a movie')}",
            "note": r.get("note"),
            "created_at": r.get("created_at", datetime.now(timezone.utc)).isoformat() if isinstance(r.get("created_at"), datetime) else str(r.get("created_at", "")),
            "read": r.get("read", False),
        })

    # Unread messages (latest per conversation)
    pipeline = [
        {"$match": {"to_user_id": user_id, "read": {"$ne": True}}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$from_user_id",
            "last_message": {"$first": "$message"},
            "count": {"$sum": 1},
            "created_at": {"$first": "$created_at"},
            "from_user_name": {"$first": "$from_user_name"},
        }},
        {"$sort": {"created_at": -1}},
        {"$limit": 20},
    ]
    async for m in db.chat_messages.aggregate(pipeline):
        notifications.append({
            "type": "message",
            "user_id": m["_id"],
            "user_name": m.get("from_user_name", "Someone"),
            "message": f"{m.get('from_user_name', 'Someone')}: {m.get('last_message', '')}",
            "unread_count": m.get("count", 1),
            "created_at": m.get("created_at", datetime.now(timezone.utc)).isoformat() if isinstance(m.get("created_at"), datetime) else str(m.get("created_at", "")),
            "read": False,
        })

    # Sort all by created_at descending
    notifications.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return notifications


# ==================== STREAMING LINKS ENDPOINTS ====================

@api_router.post("/movies/{tmdb_id}/streaming-links")
async def add_streaming_link(tmdb_id: int, link_data: StreamingLinkAdd, user: dict = Depends(get_current_user)):
    """Add a community streaming link for a movie"""
    # Validate URL
    url = link_data.url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")
    
    link_doc = {
        "id": f"slink_{uuid.uuid4().hex[:12]}",
        "tmdb_id": tmdb_id,
        "user_id": user["user_id"],
        "user_name": user["name"],
        "url": url,
        "label": link_data.label or url,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.streaming_links.insert_one(link_doc)
    link_doc.pop("_id", None)
    if isinstance(link_doc.get("created_at"), datetime):
        link_doc["created_at"] = link_doc["created_at"].isoformat()
    
    return link_doc

@api_router.get("/movies/{tmdb_id}/streaming-links")
async def get_streaming_links(tmdb_id: int):
    """Get all community streaming links for a movie"""
    links = await db.streaming_links.find(
        {"tmdb_id": tmdb_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    for link in links:
        if isinstance(link.get("created_at"), datetime):
            link["created_at"] = link["created_at"].isoformat()
    
    return links

@api_router.delete("/streaming-links/{link_id}")
async def delete_streaming_link(link_id: str, user: dict = Depends(get_current_user)):
    """Delete a community streaming link (only by the user who added it)"""
    result = await db.streaming_links.delete_one({
        "id": link_id,
        "user_id": user["user_id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Link not found or not authorized")
    
    return {"message": "Streaming link deleted"}

# ==================== SHARE IMAGE ====================

from fastapi.responses import StreamingResponse
from PIL import Image as PILImage, ImageDraw, ImageFont
import io

# Cache the logo in memory
_logo_cache = None

async def get_logo():
    global _logo_cache
    if _logo_cache is not None:
        return _logo_cache
    try:
        async with httpx.AsyncClient() as c:
            resp = await c.get("https://customer-assets.emergentagent.com/job_mobile-frog-ram/artifacts/gwbmhxc7_IMG_5893.jpeg", timeout=10)
            if resp.status_code == 200:
                _logo_cache = resp.content
                return _logo_cache
    except:
        pass
    return None

@api_router.get("/movies/{tmdb_id}/share-image")
async def get_share_image(tmdb_id: int, frgm: Optional[str] = None, imdb: Optional[str] = None, tmdb: Optional[str] = None):
    """Generate a share image with poster + FROGRAM logo + ratings"""
    try:
        async with httpx.AsyncClient() as c:
            resp = await c.get(
                f"https://api.themoviedb.org/3/movie/{tmdb_id}",
                params={"api_key": os.environ.get("TMDB_API_KEY", "")},
                timeout=10
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=404, detail="Movie not found")
            movie = resp.json()

        poster_path = movie.get("poster_path")
        if not poster_path:
            raise HTTPException(status_code=404, detail="No poster available")

        # If no ratings provided, try to fetch them
        if tmdb:
            tmdb_val = tmdb
        elif movie.get("vote_average"):
            tmdb_val = str(round(movie.get("vote_average", 0), 1))
        else:
            tmdb_val = None
        imdb_val = imdb
        if not imdb_val:
            imdb_id = movie.get("imdb_id")
            if imdb_id:
                try:
                    omdb_resp = await http_client.get(
                        f"http://www.omdbapi.com/",
                        params={"i": imdb_id, "apikey": os.environ.get("OMDB_API_KEY", "")},
                        timeout=5
                    )
                    if omdb_resp.status_code == 200:
                        omdb_data = omdb_resp.json()
                        if omdb_data.get("imdbRating") and omdb_data["imdbRating"] != "N/A":
                            imdb_val = omdb_data["imdbRating"]
                except:
                    pass

        return await _generate_share_image(poster_path, frgm=frgm, imdb=imdb_val, tmdb_rating=tmdb_val)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Share image error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate share image")

@api_router.get("/series/{tmdb_id}/share-image")
async def get_series_share_image(tmdb_id: int, frgm: Optional[str] = None):
    """Generate a share image for series with poster + FROGRAM logo + FRGM rating"""
    try:
        async with httpx.AsyncClient() as c:
            resp = await c.get(
                f"https://api.themoviedb.org/3/tv/{tmdb_id}",
                params={"api_key": os.environ.get("TMDB_API_KEY", "")},
                timeout=10
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=404, detail="Series not found")
            series = resp.json()

        poster_path = series.get("poster_path")
        if not poster_path:
            raise HTTPException(status_code=404, detail="No poster available")

        return await _generate_share_image(poster_path, frgm)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Share image error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate share image")

async def _generate_share_image(poster_path: str, frgm: Optional[str] = None, imdb: Optional[str] = None, tmdb_rating: Optional[str] = None):
    """Generate a square share image: logo + poster + ratings on dark bg"""
    # Download poster
    async with httpx.AsyncClient() as c:
        poster_resp = await c.get(f"https://image.tmdb.org/t/p/w500{poster_path}", timeout=15)
        if poster_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to download poster")

    # Load poster
    poster_img = PILImage.open(io.BytesIO(poster_resp.content)).convert("RGBA")
    pw, ph = poster_img.size

    # Square canvas
    canvas_size = 800
    canvas = PILImage.new("RGBA", (canvas_size, canvas_size), (26, 26, 46, 255))

    # Scale poster
    poster_area_h = canvas_size - 180
    poster_scale = min((canvas_size - 60) / pw, poster_area_h / ph)
    new_pw = int(pw * poster_scale)
    new_ph = int(ph * poster_scale)
    poster_resized = poster_img.resize((new_pw, new_ph), PILImage.LANCZOS)
    poster_x = (canvas_size - new_pw) // 2
    poster_y = 90 + (poster_area_h - new_ph) // 2
    canvas.paste(poster_resized, (poster_x, poster_y))

    # Add logo at top center
    logo_data = await get_logo()
    if logo_data:
        try:
            logo_img = PILImage.open(io.BytesIO(logo_data)).convert("RGBA")
            logo_h = 60
            logo_w = int(logo_img.width * (logo_h / logo_img.height))
            if logo_w > canvas_size - 40:
                logo_w = canvas_size - 40
                logo_h = int(logo_img.height * (logo_w / logo_img.width))
            logo_img = logo_img.resize((logo_w, logo_h), PILImage.LANCZOS)
            logo_x = (canvas_size - logo_w) // 2
            canvas.paste(logo_img, (logo_x, 15), logo_img)
        except Exception as logo_err:
            logger.error(f"Logo error: {logo_err}")

    # Draw green star + rating at bottom (big and bold)
    draw = ImageDraw.Draw(canvas)
    try:
        big_font = _load_font(48, bold=True)
        small_font = _load_font(20, bold=False)
    except:
        big_font = ImageFont.load_default()
        small_font = big_font

    green = (76, 175, 80, 255)  # FRGM green

    if frgm:
        # Draw a dark semi-transparent bar at the bottom for contrast
        import math
        bar_height = 80
        bar_y = canvas_size - bar_height
        overlay = PILImage.new("RGBA", (canvas_size, bar_height), (20, 20, 40, 200))
        canvas.paste(overlay, (0, bar_y), overlay)

        # Re-create draw after paste
        draw = ImageDraw.Draw(canvas)

        # Draw a filled 5-pointed green star polygon
        star_size = 26
        star_cy = bar_y + bar_height // 2
        # Measure the rating text to center everything together
        rating_text = str(frgm)
        bbox = draw.textbbox((0, 0), rating_text, font=big_font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        gap = 14
        total_w = (star_size * 2) + gap + text_w
        start_x = (canvas_size - total_w) // 2
        star_cx = start_x + star_size

        # 5-pointed star vertices
        points = []
        for i in range(5):
            outer_angle = math.radians(-90 + i * 72)
            points.append((star_cx + star_size * math.cos(outer_angle), star_cy + star_size * math.sin(outer_angle)))
            inner_angle = math.radians(-90 + i * 72 + 36)
            points.append((star_cx + star_size * 0.45 * math.cos(inner_angle), star_cy + star_size * 0.45 * math.sin(inner_angle)))
        draw.polygon(points, fill=green)

        # Draw rating number
        text_x = star_cx + star_size + gap
        text_y = bar_y + (bar_height - text_h) // 2 - bbox[1]
        draw.text((text_x, text_y), rating_text, fill=green, font=big_font)
    else:
        # No rating — leave bottom clean, no text
        pass

    # Convert to RGB for JPEG
    output = canvas.convert("RGB")
    buf = io.BytesIO()
    output.save(buf, format="JPEG", quality=90)
    buf.seek(0)

    return StreamingResponse(buf, media_type="image/jpeg", headers={
        "Content-Disposition": f'inline; filename="frogram_share.jpg"'
    })

# ==================== SHARE LIST AS IMAGE ====================
@api_router.post("/share/collage")
async def share_collage_image(request: Request):
    """Generate a poster collage image for frogseye share (small posters grid)"""
    from PIL import Image as PILImage, ImageDraw, ImageFont
    import io

    body = await request.json()
    poster_paths = body.get("poster_paths", [])
    title = body.get("title", "FROGRAM")

    if not poster_paths:
        raise HTTPException(status_code=400, detail="No posters provided")

    # Download poster images from TMDB
    poster_images = []
    async with httpx.AsyncClient() as client:
        for path in poster_paths[:30]:  # Max 30 posters
            if not path:
                continue
            try:
                url = f"https://image.tmdb.org/t/p/w154{path}"
                resp = await client.get(url, timeout=5)
                if resp.status_code == 200:
                    img = PILImage.open(io.BytesIO(resp.content)).convert("RGB")
                    poster_images.append(img)
            except Exception:
                continue

    if not poster_images:
        raise HTTPException(status_code=400, detail="Could not download any posters")

    # Calculate grid layout
    count = len(poster_images)
    cols = min(6, count)
    if count <= 4:
        cols = 2
    elif count <= 9:
        cols = 3
    elif count <= 16:
        cols = 4
    elif count <= 25:
        cols = 5
    else:
        cols = 6
    rows = (count + cols - 1) // cols

    thumb_w, thumb_h = 120, 180
    padding = 4
    header_h = 60
    footer_h = 30

    canvas_w = cols * (thumb_w + padding) + padding
    canvas_h = header_h + rows * (thumb_h + padding) + padding + footer_h

    canvas = PILImage.new("RGB", (canvas_w, canvas_h), (26, 107, 51))  # Green bg
    draw = ImageDraw.Draw(canvas)

    # Header
    try:
        header_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
    except Exception:
        header_font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), title, font=header_font)
    tw = bbox[2] - bbox[0]
    draw.text(((canvas_w - tw) // 2, 16), title, fill="white", font=header_font)

    # Place posters
    for i, img in enumerate(poster_images):
        r = i // cols
        c = i % cols
        x = padding + c * (thumb_w + padding)
        y = header_h + padding + r * (thumb_h + padding)
        resized = img.resize((thumb_w, thumb_h), PILImage.LANCZOS)
        canvas.paste(resized, (x, y))

    # Footer
    try:
        footer_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except Exception:
        footer_font = ImageFont.load_default()
    footer_text = "frogram.com"
    bbox2 = draw.textbbox((0, 0), footer_text, font=footer_font)
    ftw = bbox2[2] - bbox2[0]
    draw.text(((canvas_w - ftw) // 2, canvas_h - footer_h + 6), footer_text, fill=(200, 255, 200), font=footer_font)

    buf = io.BytesIO()
    canvas.save(buf, format="JPEG", quality=85)
    buf.seek(0)
    image_bytes = buf.getvalue()

    # Store image temporarily for download endpoint
    _cleanup_temp_images()
    download_id = str(uuid.uuid4())
    _temp_images[download_id] = {"data": image_bytes, "created": _time.time()}

    # Return both base64 and download_id for maximum compatibility
    accept = request.headers.get("accept", "")
    if "application/json" in accept:
        import base64
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        return {"base64": b64, "download_id": download_id}

    return Response(
        content=image_bytes,
        media_type="image/jpeg",
        headers={"Content-Disposition": 'inline; filename="frogram_collage.jpg"'}
    )


@api_router.post("/share/list-image")
async def share_list_image(request: Request):
    """Generate a text list image with ratings and directors for list view share"""
    from PIL import Image as PILImage, ImageDraw, ImageFont
    import io

    body = await request.json()
    movies = body.get("movies", [])
    title = body.get("title", "FROGRAM")

    if not movies:
        raise HTTPException(status_code=400, detail="No movies provided")

    movies = movies[:30]  # Max 30

    # Fonts
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)
        item_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
        sub_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 11)
        rating_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 12)
        footer_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except Exception:
        title_font = ImageFont.load_default()
        item_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()
        rating_font = ImageFont.load_default()
        footer_font = ImageFont.load_default()

    # Calculate canvas size - two lines per movie (title + director)
    line_height = 44
    header_h = 70
    footer_h = 40
    canvas_w = 600
    canvas_h = header_h + len(movies) * line_height + footer_h + 20

    canvas = PILImage.new("RGB", (canvas_w, canvas_h), (18, 18, 18))  # Dark bg
    draw = ImageDraw.Draw(canvas)

    # Green header bar
    draw.rectangle([(0, 0), (canvas_w, header_h)], fill=(26, 107, 51))
    bbox = draw.textbbox((0, 0), title, font=title_font)
    tw = bbox[2] - bbox[0]
    draw.text(((canvas_w - tw) // 2, 22), title, fill="white", font=title_font)

    # Movie list
    y = header_h + 10
    for i, movie in enumerate(movies):
        name = movie.get("name") or movie.get("title", "Unknown")
        rating = movie.get("user_rating") or movie.get("rating", "")
        year = movie.get("year", "")
        director = movie.get("director", "")

        # Alternating row bg
        if i % 2 == 0:
            draw.rectangle([(0, y), (canvas_w, y + line_height)], fill=(30, 30, 30))

        # Number
        num_text = f"{i + 1}."
        draw.text((16, y + 6), num_text, fill=(150, 150, 150), font=item_font)

        # Title + year (first line)
        title_text = f"{name}"
        if year:
            title_text += f" ({year})"
        draw.text((50, y + 4), title_text, fill="white", font=item_font)

        # Director (second line, smaller)
        if director:
            draw.text((50, y + 24), f"Dir: {director}", fill=(140, 140, 140), font=sub_font)

        # Rating star + number on right (vertically centered)
        if rating:
            rating_str = f"★ {rating}"
            rbbox = draw.textbbox((0, 0), rating_str, font=rating_font)
            rw = rbbox[2] - rbbox[0]
            draw.text((canvas_w - rw - 20, y + 12), rating_str, fill=(26, 107, 51), font=rating_font)

        y += line_height

    # Footer
    footer_text = "frogram.com"
    bbox2 = draw.textbbox((0, 0), footer_text, font=footer_font)
    ftw = bbox2[2] - bbox2[0]
    draw.text(((canvas_w - ftw) // 2, canvas_h - footer_h + 12), footer_text, fill=(120, 120, 120), font=footer_font)

    buf = io.BytesIO()
    canvas.save(buf, format="JPEG", quality=90)
    buf.seek(0)
    image_bytes = buf.getvalue()

    # Store image temporarily for download endpoint
    _cleanup_temp_images()
    download_id = str(uuid.uuid4())
    _temp_images[download_id] = {"data": image_bytes, "created": _time.time()}

    # Return both base64 and download_id for maximum compatibility
    accept = request.headers.get("accept", "")
    if "application/json" in accept:
        import base64
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        return {"base64": b64, "download_id": download_id}

    return Response(
        content=image_bytes,
        media_type="image/jpeg",
        headers={"Content-Disposition": 'inline; filename="frogram_list.jpg"'}
    )


@api_router.get("/share/download/{download_id}")
async def download_share_image(download_id: str):
    """Download a temporarily stored share image by its ID"""
    if download_id not in _temp_images:
        raise HTTPException(status_code=404, detail="Image expired or not found")
    
    data = _temp_images.pop(download_id)["data"]
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Content-Disposition": 'attachment; filename="frogram_share.jpg"'}
    )

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "FROGRAM API", "status": "running"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include the router
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IO events
@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")

@sio.event
async def join_room(sid, data):
    room = data.get("room")
    if room:
        await sio.enter_room(sid, room)
        logger.info(f"Client {sid} joined room {room}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
