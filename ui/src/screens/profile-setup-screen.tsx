import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { useProfile } from '../context/profile-context'
import { ProfileForm } from '../components/profile-form'
import { AvatarCreator } from '../components/avatar-creator'

export function ProfileSetupScreen() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { refreshProfile } = useProfile()
  const [setupStep, setSetupStep] = useState<'profile' | 'avatar'>('profile')

  function handleProfileSaveSuccess() {
    console.log('Profile details saved, proceeding to avatar creation...');
    setSetupStep('avatar');
  }

  function handleAvatarSaveSuccess() {
    console.log('Avatar saved, setup complete. Navigating to home...');
    navigate('/home');
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-yellow-100 overflow-hidden p-4">
       {setupStep === 'profile' && (
         <ProfileForm 
            currentUser={currentUser}
            onSaveSuccess={handleProfileSaveSuccess}
            refreshProfile={refreshProfile}
            mode="setup"
         />
       )}

       {setupStep === 'avatar' && currentUser && (
         <AvatarCreator 
            userId={currentUser.uid}
            onSaveSuccess={handleAvatarSaveSuccess}
            mode="setup"
         />
       )}

       {setupStep === 'avatar' && !currentUser && (
         <p>Loading user information...</p>
       )}
    </div>
  );
}