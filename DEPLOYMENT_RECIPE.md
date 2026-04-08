# 🚀 King Office Deployment Recipe (Render)

Use these settings to deploy the backend to Render.

| Field | Value |
| :--- | :--- |
| **Service Type** | Web Service |
| **Runtime** | Python |
| **Root Directory** | `backend` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

## Environment Variables

Copy the contents of your `backend/.env` file to the Render Environment Variables section. **Crucial updates for Production:**

1.  **`ENVIRONMENT`**: Set to `production`.
2.  **`DATABASE_URL`**: Ensure this is your production Supabase connection string.
3.  **`SECRET_KEY`**: Ensure this is a strong, unique secret (generated during our session).

> [!IMPORTANT]
> When `ENVIRONMENT=production` is set, the system will enforce stricter security rules (e.g., rejecting default secret keys).
