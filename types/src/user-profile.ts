// Copied from ui/src/services/firestore-service.ts
import { Timestamp, FieldValue } from "firebase/firestore";

export interface UserProfile {
    uid: string; 
    name: string;
    birthday: Date | null;
    gender?: 'boy' | 'girl';
    avatarSeed?: string; 
    avatarUrl?: string; 
    createdAt: Timestamp | FieldValue; 
    onboardingComplete: boolean;
    // Add other fields as needed
} 