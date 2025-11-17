'use client'

import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

function SignUpConfirmContent() {
    const searchParams = useSearchParams()
    const confirmLink = searchParams.get('confirmLink')

    return (
        <div className="mt-8 mb-20">
            {!confirmLink ? null :
                <p className="my-4">
                    Normally this would be emailed:
                    <a className="pl-2 font-semibold" id="confirm-link" href={confirmLink}>
                        Click here to confirm your account
                    </a>
                </p>}
            <p className="my-4">Please check your email to confirm your account.</p>
        </div>
    )
}

export default function SignUpConfirm() {
    return (
        <div className="container mx-auto px-4 py-8">
            <Suspense fallback={<div className="mt-8 mb-20">Loading...</div>}>
                <SignUpConfirmContent />
            </Suspense>
        </div>
    )
}
