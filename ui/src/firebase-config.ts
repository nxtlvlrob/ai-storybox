import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
// TODO: Add imports for Firestore, Storage etc. when needed
// import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// IMPORTANT: Replace with your actual config values
// Consider using environment variables for security!
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  console.log("Firebase initialized successfully (Auth, Firestore).");
} catch (error) {
  console.error("Error initializing Firebase:", error);
  // Handle initialization error appropriately
  // Maybe show an error message to the user or retry
  throw new Error("Firebase initialization failed");
}

// Export the initialized services
export { app, auth, db }; 