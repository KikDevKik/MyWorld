# MyWorld

AI-Powered Creative Writing Environment with Socratic Guidance.

Built for Gemini Hackathon 3 | Powered by Gemini 3.0 Pro

## 🚀 Setup Instructions

### Prerequisites
*   Node.js (v18+)
*   pnpm (v9+)
*   Firebase CLI (installed globally)

### Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/MyWorld.git
    cd MyWorld
    ```
2.  Install dependencies:
    ```bash
    npm install
    # or
    pnpm install
    ```

### Configuration
1.  Create a `.env.local` file in the root directory and add your Firebase configuration:
    ```env
    VITE_FIREBASE_API_KEY=your_api_key
    VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=your_project_id
    VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
    VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
    VITE_FIREBASE_APP_ID=your_app_id
    ```
2.  Set up Firebase Functions secrets (if deploying):
    ```bash
    firebase functions:secrets:set GOOGLE_API_KEY
    firebase functions:secrets:set BAPTISM_MASTER_KEY
    ```

### Running Local Development
Start the development server:
```bash
npm run dev
# or
pnpm dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

## 🚀 System Modules

* **🖋️ The Editor:** "Zen Mode" WYSIWYG interface with dynamic typography and telemetry.
* **⚖️ The Tribunal:** Narrative judgment with 3 AI personalities (Architect, Bard, Hater).
* **🧪 The Laboratory:** Asset management (Canon vs Reference) with RAG research chat.
* **🖨️ The Press:** Manuscript compilation and PDF export.
* **🔨 The Forge:** Idea and character generator.

## 🛠️ Tech Stack

* **Frontend:** React + Vite + TailwindCSS (Titanium Dark Theme).
* **Backend:** Firebase Cloud Functions v2.
* **AI:** Google Gemini 3.0 Pro & Flash.
* **Database:** Firestore (Vector Search).
