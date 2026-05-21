# DreamScape AI

DreamScape AI is a Node.js and Express dream analysis demo with static HTML, CSS, and JavaScript.

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Verify Before Deployment

```bash
npm run check
```

This checks server syntax, browser script syntax, and the core API flow: health, register, login, and authenticated dream submission.

## Deployment Notes

- Set `JWT_SECRET` in the hosting environment.
- Set `GEMINI_API_KEY` in the hosting environment to enable live Gemini responses.
- Set `PORT` only if your host does not provide it automatically.
- Optional: set `CORS_ORIGIN` to your production domain.
- The current demo stores users and dreams in memory, so data resets whenever the server restarts. Add a database before relying on persistent accounts.
