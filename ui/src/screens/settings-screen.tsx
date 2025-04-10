import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { useProfile } from '../context/profile-context'
import { ProfileForm } from '../components/profile-form'
import { AvatarCreator } from '../components/avatar-creator'
import { Timestamp } from 'firebase/firestore';

export function SettingsScreen() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { userProfile, profileLoading, refreshProfile } = useProfile()
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isEditingAvatar, setIsEditingAvatar] = useState(false)
  const [editSuccessMessage, setEditSuccessMessage] = useState<string | null>(null)

  function handleEditProfileClick() {
    setIsEditingProfile(true)
    setIsEditingAvatar(false)
    setEditSuccessMessage(null)
  }

  function handleEditAvatarClick() {
    setIsEditingAvatar(true)
    setIsEditingProfile(false)
    setEditSuccessMessage(null)
  }

  function handleCancelEdit() {
    setIsEditingProfile(false)
    setIsEditingAvatar(false)
  }

  function handleProfileSaveSuccess() {
    setIsEditingProfile(false)
    setEditSuccessMessage('Profile details updated successfully!')
    setTimeout(() => setEditSuccessMessage(null), 3000)
  }
  
  function handleAvatarSaveSuccess() {
    setIsEditingAvatar(false)
    setEditSuccessMessage('Avatar updated successfully!')
    setTimeout(() => setEditSuccessMessage(null), 3000)
  }

  const isEditing = isEditingProfile || isEditingAvatar;

  const initialProfileData = userProfile ? {
    name: userProfile.name,
    birthday: userProfile.birthday && userProfile.birthday instanceof Timestamp 
              ? userProfile.birthday.toDate() 
              : userProfile.birthday instanceof Date 
              ? userProfile.birthday
              : null,
    gender: userProfile.gender,
  } : undefined;

  return (
    <div className="flex flex-col items-center justify-start pt-6 h-screen bg-blue-100 overflow-y-auto px-4">
      <div className="w-full max-w-3xl flex items-center justify-between mb-6">
        <button 
          className="px-3 py-1.5 rounded-lg text-sm text-blue-700 bg-white bg-opacity-70 hover:bg-opacity-100 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
          onClick={() => isEditing ? handleCancelEdit() : navigate(-1)}
        >
          {isEditing ? 'Cancel' : 'Back'}
        </button>
        
        <h1 className="text-2xl sm:text-3xl font-bold text-blue-800 flex-grow text-center px-4">Settings</h1>

        <div className="flex-shrink-0 invisible" aria-hidden="true">
           <button className="px-3 py-1.5 rounded-lg text-sm">Back</button>
        </div>
      </div>

      {editSuccessMessage && (
        <div className="mb-4 p-3 bg-green-200 text-green-800 rounded-lg w-full max-w-md text-center">
          {editSuccessMessage}
        </div>
      )}

      {isEditingProfile ? (
        <div className="w-full max-w-md">
          <ProfileForm
            currentUser={currentUser}
            initialProfileData={initialProfileData}
            onSaveSuccess={handleProfileSaveSuccess}
            refreshProfile={refreshProfile}
            mode="edit"
          />
        </div>
      ) : isEditingAvatar ? (
        currentUser && (
          <div className="w-full max-w-3xl">
            <AvatarCreator
              userId={currentUser.uid}
              currentAvatarConfig={userProfile?.avatarConfig}
              onSaveSuccess={handleAvatarSaveSuccess}
              mode="edit"
            />
          </div>
        )
      ) : (
        <div className="flex flex-col items-center w-full max-w-xl">
          <p className="mb-6 text-center px-4">Adjust Storybox settings here.</p>
          {profileLoading ? (
            <p>Loading profile...</p>
          ) : userProfile ? (
            <div className="space-y-4 flex flex-col items-center w-full">
              <div className="bg-white p-6 rounded-lg shadow-md w-full flex flex-col md:flex-row items-center md:items-start gap-6">
                 <div className="flex-shrink-0 mx-auto md:mx-0">
                   {userProfile.avatarUrl ? (
                     <img src={userProfile.avatarUrl} alt="Avatar" className="w-28 h-28 rounded-full border-2 border-gray-300" />
                   ) : (
                     <div className="w-28 h-28 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-base">
                       No Avatar
                     </div>
                   )}
                 </div>
                 
                 <div className="flex-grow flex flex-col items-center md:items-start w-full">
                   <p className="text-xl font-semibold mb-1 text-center md:text-left">{userProfile.name}</p>
                   {(userProfile.birthday instanceof Timestamp || userProfile.birthday instanceof Date) && (
                       <p className="text-sm text-gray-600 mb-1 text-center md:text-left">
                         Birthday: {userProfile.birthday instanceof Timestamp 
                                     ? userProfile.birthday.toDate().toLocaleDateString() 
                                     : userProfile.birthday.toLocaleDateString()}
                       </p>
                   )}
                   {userProfile.gender && (
                       <p className="text-sm text-gray-600 mb-4 text-center md:text-left">Gender: {userProfile.gender}</p>
                   )}
                   
                   <div className="mt-4 pt-4 border-t border-gray-200 w-full flex flex-col sm:flex-row items-center justify-center md:justify-start space-y-3 sm:space-y-0 sm:space-x-3">
                     <button
                       onClick={handleEditProfileClick}
                       className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                     >
                       Edit Profile
                     </button>
                     <button 
                        onClick={handleEditAvatarClick}
                        className="w-full sm:w-auto px-5 py-2.5 bg-green-500 text-white text-sm font-semibold rounded-lg shadow hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                     >
                       Edit Avatar
                     </button>
                   </div>
                 </div>
              </div>
            </div>
          ) : (
            <p>Could not load profile.</p>
          )}
        </div>
      )}
    </div>
  )
} 