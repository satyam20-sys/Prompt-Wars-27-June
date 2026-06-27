# ExamZen — Student Mental Wellness Companion

## Live Demo: [Railway / Render Url Placeholder]

## What Makes This Different
1. **Burnout Trajectory Predictor** — Analyzes real student stress logs (minimum 3 entries required) using Gemini 1.5 Flash to identify somatic/emotional warnings signs and recommend micro-plans, rather than outputting generic linear charts.
2. **Voice Journaling** — Speak your anxiety away. Uses browser native Web Speech API tailored with the `en-IN` dialect specifically for Indian English & Hinglish transcription.
3. **Stress DNA Report** — A weekly stress fingerprint mapping root stressors, default emotional responses, and a personalized mantra in Hindi/English (e.g. *Karmanye Vadhikaraste* or similar relevant themes) matching the aspirant's mind.

## Setup
```bash
# Clone the repository
git clone <repo>

# Move into the project directory
cd student-wellness-companion

# Install dependencies
pip install -r requirements.txt

# Configure your environment variables
cp .env.example .env
# Open .env and paste your GEMINI_API_KEY:
# GEMINI_API_KEY=AIzaSy...

# Run the backend server locally
python app.py

# Visit in your Chrome or Edge browser:
# http://localhost:5000
```

## Get Free Gemini API Key
Generate your API keys directly from the Google AI Studio Console:
https://aistudio.google.com/app/apikey

## Architecture
User (Web Speech API / Chrome) → Flask Backend (app.py) → Gemini 1.5 Flash API (Structured JSON Mode) → stored locally (journal_data.json) → dynamic rendering (Chart.js dashboard & custom CSS theme).

## Assumptions
- **Single User Scope**: Designed as a local/instance companion database (`journal_data.json`) suitable for hackathons, with no multi-user session authentications.
- **Microphone Permissions**: Web Speech transcription operates over HTTPS (or localhost) and needs Chrome/Edge.
- **Data Deletion / Clear Reset**: To restart from a completely empty state, delete the local `journal_data.json` file. It will re-initialize as `[]` on startup.
- **Safety Warnings**: Crisis keyword classification triggers alert instructions pointing to helplines. It is entirely assistive and is not a clinical mental health diagnostic replacement.
