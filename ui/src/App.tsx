import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="p-8 flex flex-col items-center space-y-4 bg-black">
      <div className="flex space-x-4">
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="h-24 w-24" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="h-24 w-24 animate-spin [animation-duration:20s]" alt="React logo" />
        </a>
      </div>
      <h1 className="text-4xl font-bold text-blue-600 dark:text-blue-400">Vite + React</h1>
      <div className="p-6 border border-gray-300 rounded-lg shadow-md bg-gray-50 dark:bg-gray-800">
        <button 
          className="px-4 py-2 font-semibold text-white bg-indigo-600 rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          onClick={() => setCount((count) => count + 1)}
        >
          count is {count}
        </button>
        <p className="mt-4 text-gray-700 dark:text-gray-300">
          Edit <code className="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded">src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  )
}

export default App
