# CitiTour API Documentation

**Base URL**: `http://localhost:5000/api`

**Production URL**: `https://your-domain.com/api`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Destination Endpoints](#destination-endpoints)
3. [AI Endpoints](#ai-endpoints)
4. [Response Format](#response-format)
5. [Error Handling](#error-handling)
6. [Rate Limits](#rate-limits)

---

## Authentication

All endpoints support **optional authentication**. If you provide a valid JWT token, your usage will be tracked and tier-based limits will apply. Without authentication, IP-based rate limiting applies.

### Headers

```
Authorization: Bearer <your_jwt_token>
```

### Rate Limits by Tier

| Tier | AI Requests | Destination Searches | Images/Weather |
|------|-------------|---------------------|----------------|
| **Guest** (No auth) | 20/hour | 50/15min | 40/hour |
| **Free** | 20/hour | 50/15min | 40/hour |
| **Pro** | Unlimited | Unlimited | Unlimited |
| **Premium** | Unlimited | Unlimited | Unlimited |

---

## Destination Endpoints

### 1. Search Destinations

Search for destinations using Wikipedia.

**Endpoint**: `GET /api/destinations/search`

**Query Parameters**:
- `q` (required): Search query (min 2 characters)
- `limit` (optional): Number of results (default: 5, max: 10)

**Example Request**:
```bash
curl 'http://localhost:5000/api/destinations/search?q=tokyo&limit=3'
```

**Example Response**:
```json
{
  "success": true,
  "data": [
    {
      "title": "Tokyo",
      "description": "Tokyo, officially the Tokyo Metropolis...",
      "image": "https://upload.wikimedia.org/wikipedia/commons/...",
      "url": "https://en.wikipedia.org/wiki/Tokyo",
      "weather": {
        "temperature": 13,
        "description": "broken clouds",
        "icon": "https://openweathermap.org/img/wn/04n@2x.png"
      },
      "source": "Wikipedia"
    }
  ],
  "count": 3,
  "timestamp": "2025-11-12T09:17:17.726Z"
}
```

---

### 2. Get Quick Overview

Get a quick overview with summary and current weather.

**Endpoint**: `GET /api/destinations/:name/quick`

**Path Parameters**:
- `name`: Destination name (e.g., "Tokyo", "Paris")

**Example Request**:
```bash
curl 'http://localhost:5000/api/destinations/Tokyo/quick'
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "destination": "Tokyo",
    "timestamp": "2025-11-12T09:17:17.290Z",
    "summary": {
      "title": "Tokyo",
      "description": "Tokyo, officially the Tokyo Metropolis, is the capital...",
      "image": "https://upload.wikimedia.org/wikipedia/commons/...",
      "url": "https://en.wikipedia.org/wiki/Tokyo"
    },
    "weather": {
      "temperature": 13,
      "description": "broken clouds",
      "icon": "https://openweathermap.org/img/wn/04n@2x.png"
    }
  }
}
```

---

### 3. Get Comprehensive Destination Data

Get comprehensive data from all sources (Wikipedia, Weather, Images).

**Endpoint**: `GET /api/destinations/:name`

**Path Parameters**:
- `name`: Destination name

**Query Parameters**:
- `includeWeather` (optional): Include weather data (default: true)
- `includeImages` (optional): Include images (default: true)
- `includeForecast` (optional): Include weather forecast (default: true)
- `includeRelated` (optional): Include related destinations (default: false)
- `units` (optional): Temperature units - 'metric' or 'imperial' (default: 'metric')

**Example Request**:
```bash
curl 'http://localhost:5000/api/destinations/Paris?includeWeather=true&includeImages=true&units=metric'
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "destination": "Paris",
    "timestamp": "2025-11-12T09:00:00.000Z",
    "sources": ["Wikipedia", "OpenWeather", "Unsplash"],
    "completeness": 95,
    "data": {
      "info": {
        "title": "Paris",
        "description": "Paris is the capital and most populous city of France...",
        "fullContent": "Full Wikipedia article text...",
        "url": "https://en.wikipedia.org/wiki/Paris",
        "image": "https://upload.wikimedia.org/...",
        "coordinates": {
          "lat": 48.8566,
          "lon": 2.3522
        },
        "categories": ["Capital cities", "Cities in France", ...],
        "source": "Wikipedia"
      },
      "weather": {
        "city": "Paris",
        "country": "FR",
        "temperature": 15,
        "feelsLike": 14,
        "tempMin": 13,
        "tempMax": 17,
        "humidity": 70,
        "description": "light rain",
        "icon": "10d",
        "iconUrl": "https://openweathermap.org/img/wn/10d@2x.png",
        "windSpeed": 4.5,
        "coordinates": { "lat": 48.8566, "lon": 2.3522 },
        "source": "OpenWeather"
      },
      "forecast": [
        {
          "date": "2025-11-12",
          "avgTemperature": 16,
          "minTemperature": 13,
          "maxTemperature": 19,
          "description": "light rain",
          "humidity": 70,
          "precipitationProbability": 65
        }
      ],
      "images": [
        {
          "url": "https://images.unsplash.com/...",
          "thumb": "https://images.unsplash.com/.../thumb",
          "description": "Eiffel Tower at sunset",
          "photographer": "John Doe",
          "source": "Unsplash"
        }
      ]
    }
  }
}
```

---

### 4. Get Travel Planning Data

Get comprehensive travel planning data with recommendations, best time to visit, things to do, etc.

**Endpoint**: `GET /api/destinations/:name/travel`

**Path Parameters**:
- `name`: Destination name

**Query Parameters**:
- `units` (optional): Temperature units (default: 'metric')

**Example Request**:
```bash
curl 'http://localhost:5000/api/destinations/Barcelona/travel?units=metric'
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "destination": "Barcelona",
    "overview": {
      "title": "Barcelona",
      "description": "Barcelona is a city on the coast of northeastern Spain...",
      "heroImage": "https://images.unsplash.com/..."
    },
    "currentConditions": {
      "temperature": 22,
      "feelsLike": 21,
      "description": "sunny",
      "humidity": 60,
      "windSpeed": 4.5,
      "icon": "https://openweathermap.org/img/wn/01d@2x.png"
    },
    "weatherForecast": [
      {
        "date": "2025-11-12",
        "avgTemperature": 22,
        "minTemperature": 18,
        "maxTemperature": 26,
        "description": "sunny",
        "precipitationProbability": 10
      }
    ],
    "recommendations": [
      "Perfect weather for outdoor activities!",
      "Rich historical heritage - consider guided tours",
      "Renowned culinary destination - try local specialties"
    ],
    "bestTimeToVisit": {
      "bestDay": "2025-11-14",
      "score": 92,
      "reason": "Best conditions: ideal temperature, low chance of rain, clear skies",
      "alternatives": ["2025-11-15", "2025-11-13"]
    },
    "thingsToDo": [
      "Visit museums and cultural centers",
      "Explore historical landmarks",
      "Experience local shopping districts",
      "Try local cuisine and restaurants"
    ],
    "nearbyDestinations": [],
    "imageGallery": [
      {
        "url": "https://images.unsplash.com/...",
        "thumb": "https://images.unsplash.com/.../thumb",
        "description": "Sagrada Familia",
        "photographer": "Jane Smith",
        "attribution": "Photo by Jane Smith on Unsplash"
      }
    ],
    "coordinates": { "lat": 41.3874, "lon": 2.1686 },
    "sources": ["Wikipedia", "OpenWeather", "Unsplash"],
    "completeness": 98
  }
}
```

---

### 5. Get Destination Images

Get high-quality images from Unsplash with Wikipedia fallback.

**Endpoint**: `GET /api/destinations/:name/images`

**Path Parameters**:
- `name`: Destination name

**Query Parameters**:
- `count` (optional): Number of images (default: 10, max: 30)

**Example Request**:
```bash
curl 'http://localhost:5000/api/destinations/Rome/images?count=5'
```

**Example Response**:
```json
{
  "success": true,
  "data": [
    {
      "url": "https://images.unsplash.com/photo-.../regular",
      "thumb": "https://images.unsplash.com/photo-.../thumb",
      "full": "https://images.unsplash.com/photo-.../full",
      "description": "Colosseum at sunset",
      "photographer": "Photographer Name",
      "source": "Unsplash",
      "attribution": "Photo by ... on Unsplash",
      "width": 4000,
      "height": 3000
    }
  ],
  "count": 5
}
```

---

### 6. Get Current Weather

Get current weather conditions for a destination.

**Endpoint**: `GET /api/destinations/:name/weather`

**Path Parameters**:
- `name`: Destination name

**Query Parameters**:
- `units` (optional): 'metric' or 'imperial' (default: 'metric')

**Example Request**:
```bash
curl 'http://localhost:5000/api/destinations/London/weather?units=metric'
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "city": "London",
    "country": "GB",
    "temperature": 12,
    "feelsLike": 10,
    "tempMin": 10,
    "tempMax": 14,
    "humidity": 75,
    "pressure": 1013,
    "description": "light rain",
    "main": "Rain",
    "icon": "10d",
    "iconUrl": "https://openweathermap.org/img/wn/10d@2x.png",
    "windSpeed": 5.5,
    "windDirection": 180,
    "clouds": 80,
    "visibility": 10000,
    "sunrise": "2025-11-12T06:30:00.000Z",
    "sunset": "2025-11-12T16:45:00.000Z",
    "coordinates": { "lat": 51.5074, "lon": -0.1278 },
    "units": "metric",
    "source": "OpenWeather"
  }
}
```

---

### 7. Get Weather Forecast

Get 5-day weather forecast with daily summaries.

**Endpoint**: `GET /api/destinations/:name/forecast`

**Path Parameters**:
- `name`: Destination name

**Query Parameters**:
- `units` (optional): 'metric' or 'imperial' (default: 'metric')

**Example Request**:
```bash
curl 'http://localhost:5000/api/destinations/New York/forecast?units=imperial'
```

**Example Response**:
```json
{
  "success": true,
  "data": [
    {
      "date": "2025-11-12",
      "avgTemperature": 65,
      "minTemperature": 58,
      "maxTemperature": 72,
      "description": "partly cloudy",
      "icon": "02d",
      "iconUrl": "https://openweathermap.org/img/wn/02d@2x.png",
      "humidity": 65,
      "precipitationProbability": 20
    }
  ],
  "city": "New York",
  "country": "US"
}
```

---

### 8. Get Wikipedia Info

Get detailed Wikipedia information for a destination.

**Endpoint**: `GET /api/destinations/:name/info`

**Path Parameters**:
- `name`: Destination name

**Example Request**:
```bash
curl 'http://localhost:5000/api/destinations/Sydney/info'
```

**Example Response**:
```json
{
  "success": true,
  "data": {
    "title": "Sydney",
    "description": "Sydney is the capital city of the state of New South Wales...",
    "fullContent": "Full Wikipedia article content...",
    "image": "https://upload.wikimedia.org/...",
    "url": "https://en.wikipedia.org/wiki/Sydney",
    "coordinates": { "lat": -33.8688, "lon": 151.2093 },
    "categories": ["Cities in Australia", "Capital cities", ...]
  }
}
```

---

## Response Format

All API responses follow this format:

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2025-11-12T09:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error information",
  "statusCode": 400
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid or missing token |
| 404 | Not Found - Destination not found |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable - External API unavailable |

### Rate Limit Error Response

When you exceed rate limits:

```json
{
  "success": false,
  "message": "Too many destination requests. Please try again in 15 minutes.",
  "retryAfter": "15 minutes"
}
```

For authenticated users who hit tier limits:

```json
{
  "success": false,
  "message": "You have exceeded your free tier limit for search requests",
  "rateLimit": {
    "limit": 50,
    "current": 51,
    "remaining": 0
  },
  "upgrade": {
    "message": "Upgrade to Pro for unlimited requests",
    "plans": {
      "pro": {
        "price": "$9.99/month",
        "limit": "unlimited"
      }
    },
    "upgradeUrl": "/pricing"
  }
}
```

---

## Rate Limits

### IP-Based (Guest Users)

| Endpoint | Limit | Window |
|----------|-------|--------|
| Search | 30 requests | 15 minutes |
| Destination Data | 50 requests | 15 minutes |
| Weather/Images | 40 requests | 1 hour |

### User-Based (Authenticated)

**Free Tier**:
- Same as IP-based limits
- Usage tracked per account
- Monetization prompts when limits hit

**Pro Tier** ($9.99/month):
- Unlimited requests
- Priority support
- Advanced features

**Premium Tier** ($24.99/month):
- Unlimited requests
- Highest priority
- All premium features

---

## Angular Integration Example

```typescript
import { DestinationService } from './services/destination.service';

export class TripPlannerComponent {
  constructor(private destinationService: DestinationService) {}

  searchDestinations() {
    this.destinationService.searchDestinations('Tokyo', 5).subscribe({
      next: (response) => {
        console.log('Found destinations:', response.data);
        this.destinations = response.data;
      },
      error: (err) => {
        console.error('Search failed:', err);
      }
    });
  }

  getTravelData() {
    this.destinationService.getTravelPlanningData('Paris', 'metric').subscribe({
      next: (response) => {
        console.log('Travel data:', response.data);
        this.travelData = response.data;
        this.recommendations = response.data.recommendations;
        this.weatherForecast = response.data.weatherForecast;
        this.imageGallery = response.data.imageGallery;
      },
      error: (err) => {
        console.error('Failed to get travel data:', err);
      }
    });
  }
}
```

---

## Data Sources

All data is aggregated from FREE APIs:

| Source | Data Provided | Rate Limit | API Key Required |
|--------|---------------|------------|------------------|
| **Wikipedia** | Destination info, descriptions, categories | Unlimited | No |
| **OpenWeather** | Current weather, 5-day forecast | 60/min, 1M/month | Yes (FREE) |
| **Unsplash** | High-quality images (up to 3000px) | 50/hour | Yes (FREE) |

**Total Cost**: $0/month 🎉

---

## Notes

1. **Graceful Degradation**: If weather or images are unavailable, the API continues with available data
2. **Completeness Score**: Each response includes a completeness percentage (0-100%)
3. **Caching**: Consider implementing client-side caching to reduce API calls
4. **Error Handling**: Always handle 503 errors (service unavailable) gracefully
5. **Rate Limiting**: Track your usage and implement exponential backoff for rate limit errors

---

**Last Updated**: November 12, 2025

**Version**: 1.0.0
