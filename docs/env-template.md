# Environment Variables Setup

Copy the contents below to a file named `.env.local` in the root of your project:

```bash
# YouTube API Key (Required)
# Create one at: https://console.cloud.google.com/apis/credentials
YOUTUBE_API_KEY=your_youtube_api_key_here

# OpenAI API Key (Optional - Enables AI-enhanced matching)
# Create one at: https://platform.openai.com/api-keys
OPENAI_API_KEY=your_openai_api_key_here
```

## Important Notes:

1. The YouTube API key is required for the application to function.
2. The OpenAI API key is optional but enables AI-enhanced transcript matching, which greatly improves the quality of results.
3. AI-enhanced matching uses GPT models to understand the semantic meaning of your tweets and match them to relevant parts of video transcripts.
4. Without the OpenAI API key, the app will fall back to algorithm-based matching, which is less accurate but still functional.

## Getting API Keys:

### YouTube API Key:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the YouTube Data API v3
4. Create an API key in the Credentials section
5. Copy the API key to your `.env.local` file

### OpenAI API Key:
1. Go to [OpenAI's platform](https://platform.openai.com/api-keys)
2. Sign up or log in to your OpenAI account
3. Create a new API key
4. Copy the API key to your `.env.local` file

After setting up the environment variables, restart your development server for the changes to take effect. 