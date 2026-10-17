# Deploy QueueLess on Render

The repository includes a Render Blueprint at `render.yaml`. It defines a FastAPI backend, a Next.js frontend, and a PostgreSQL database in Singapore. The services are configured for Render's free tier for demonstration use.

## Deploy

1. Push this repository to GitHub. Confirm that `backend/.env`, `frontend/.env.local`, and other credential files are not committed.
2. Sign in to Render and choose **New + → Blueprint**.
3. Connect the GitHub repository and select the branch to deploy.
4. Review the Blueprint resources (`queueless-api`, `queueless-web`, and `queueless-db`) and approve their creation.
5. Wait for the database and both services to finish deploying.
6. Open https://queueless-web.onrender.com. The frontend is configured to call the API at https://queueless-api-lvf5.onrender.com.
7. Check https://queueless-api-lvf5.onrender.com/ and confirm the API responds.

If you change either service's public Render URL in its settings, update `NEXT_PUBLIC_API_URL` and `FRONTEND_ORIGINS` in `render.yaml` to match, then redeploy.

## Notes

- The free PostgreSQL database is temporary and may expire after Render's free database period. Use a paid database plan and configure backups for persistent data.
- Free web services may sleep when idle and take time to wake on the next request.
- The fixed OTP (`123456`) is for demonstration only. Do not use real patient data; authentication, authorization, and production health-data safeguards are not implemented.
- This deploy configuration does not commit database credentials. Render supplies the database connection string through the `DATABASE_URL` environment variable.
