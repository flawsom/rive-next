# How to create the .env file

The .env file will be created based on .env.example  
The values to be filled are:

## 1. Firebase configuration

```.env
NEXT_PUBLIC_FB_API_KEY=
NEXT_PUBLIC_FB_AUTH_DOMAIN=
NEXT_PUBLIC_FB_PROJECT_ID=
NEXT_PUBLIC_FB_STORAGE_BUCKET=
NEXT_PUBLIC_FB_SENDER_ID=
NEXT_PUBLIC_FB_APP_ID=
NEXT_PUBLIC_FB_MEASUREMENT_ID=
```

Steps to get the credentials:

- Go to the [Firebase Console](https://console.firebase.google.com/).
- Create a new project or select an existing one.
- Navigate to Project Settings > General.
- Under Your apps, click on the Web app (</>) icon to register a new app.
- Copy the config object's values into your `.env` file.

## 2. TMDB configuration

```.env
  NEXT_PUBLIC_TMDB_API=https://api.themoviedb.org/3
  NEXT_PUBLIC_TMDB_API_KEY=
  NEXT_PUBLIC_TMBD_IMAGE_URL=https://image.tmdb.org/t/p/original/
```

Steps to get TMDB API KEY

- Go to the [TMDB website](https://www.themoviedb.org/).
- Sign up or log in to your account.
- Navigate to Account Settings > API.
- Request an API key if you don't have one already.
- Copy your API key into your `.env` file.

## 3. Video Streaming API

```.env
NEXT_PUBLIC_STREAM_URL=
```

This is the single streaming source URL (HDHub4U embed domain).  
The app uses a clean single-source architecture.

> [!TIP]  
> Set this to your HDHub4U embed URL domain. The watch page will construct  
> movie and TV show URLs using: `${STREAM_URL}/movie/{id}` and  
> `${STREAM_URL}/tv/{id}/{season}/{episode}`

## 4. AI Integration (OpenAI-compatible gateway)

```.env
OPENAI_API_KEY=
OPENAI_BASE_URL=https://kiraai.vn/api/v1
AI_MODEL=mimo-v2.5
```

Any OpenAI-compatible gateway works — Rive does not call OpenAI directly.
`AI_MODEL` picks the preferred model; a fallback chain automatically tries
other gateway models on quota/outage errors.

This powers the AI features including:

- **AI Chat Assistant** (`/ai` page) — conversational movie/show recommendations
- **AI Content Insights** — personalized insights on detail pages
- **AI-Powered Search** — enhanced content discovery

> [!NOTE]
> The AI features will gracefully degrade if no API key is provided.  
> The chat will show an error message, and content insights will be hidden.
> Freshness comes from live TMDB data injected into prompts — no gateway
> needs native web browsing.

## **Disclaimer**

> [!IMPORTANT]
>
> Rive-Next does not host any files, it merely links to 3rd party services.  
> Legal issues should be taken up with the file hosts and providers.  
> Rive-Next is not responsible for any media files shown by the video providers.

Happy Coding :)
