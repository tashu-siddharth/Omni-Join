# Omni Join

Project continuity and intelligent knowledge handover platform.
Team Tensor Titans (solo: Tashu Siddharth), INMANTEC College, We Code Coders Hackathon, Round 2.

## What it does
- Capture decisions, tasks, blockers, risks and owners while work happens
- Upload .txt/.md/.csv files and extract items with source line references
- Knowledge Continuity Check flags: no owner, decision without reason, blocker without next action, single-owner risk
- Reviewer approves, edits or rejects each item
- Incoming member sees only approved items, plus a first-72-hours checklist

## Demo logins
- Owner: owner@demo.com / demo1234
- Incoming member: new@demo.com / demo1234

## Tech stack
React + Vite, Node.js + Express, SQLite, JWT + bcrypt, Gemini API with rule-based fallback

## Run locally
cd server, then npm install and npm start
cd client, then npm install and npm run dev
Add server/.env with PORT, JWT_SECRET, GEMINI_API_KEY, GEMINI_MODEL
