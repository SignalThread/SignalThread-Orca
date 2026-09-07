import { Suspense } from 'react'
import CreateSurveyClient from './CreateSurveyClient'

export default function CreateSurveyPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
            </div>
        }>
            <CreateSurveyClient />
        </Suspense>
    )
}
