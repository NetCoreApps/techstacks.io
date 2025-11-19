'use client'

import {serializeToObject} from "@servicestack/client"
import {SyntheticEvent, Suspense, useEffect, useState} from "react"
import {useRouter, useSearchParams} from "next/navigation"
import Link from "next/link"

import {ErrorSummary, TextInput, PrimaryButton, SecondaryButton, useClient, ApiStateContext} from "@servicestack/react"
import {appAuth, Redirecting} from "@/lib/auth/"
import {getRedirect, apiUrl} from "@/lib/api/gateway"
import { Authenticate } from "@/shared/dtos"

function SignInContent() {

    const client = useClient()
    const [username, setUsername] = useState<string | number>()
    const [password, setPassword] = useState<string | number>()

    const setUser = (email: string) => {
        setUsername(email)
        setPassword('p@55wOrd')
    }
    const router = useRouter()
    const searchParams = useSearchParams()

    const {user, revalidate} = appAuth()
    useEffect(() => {
        if (user) {
            const redirect = getRedirect(Object.fromEntries(searchParams.entries())) || "/"
            router.replace(redirect)
        }
    }, [user]);
    if (user) return <Redirecting/>

    const onSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault()

        const {userName, password, rememberMe} = serializeToObject(e.currentTarget);
        const api = await client.api(new Authenticate({provider: 'credentials', userName, password, rememberMe}))
        if (api.succeeded)
            await revalidate()
    }

    return (
        <>
            <ApiStateContext.Provider value={client}>
                <section className="mt-4 max-w-xl space-y-6">
                    <form onSubmit={onSubmit}>
                        <div className="shadow overflow-hidden sm:rounded-md">
                            <ErrorSummary except="userName,password,rememberMe"/>
                            <div className="px-4 py-5 bg-white space-y-6 sm:p-6">
                                <div className="flex flex-col gap-y-4">
                                    <TextInput id="userName" help="Email you signed up with" autoComplete="email"
                                               value={username} onChange={setUsername}/>
                                    <TextInput id="password" type="password" help="6 characters or more"
                                               autoComplete="current-password"
                                               value={password} onChange={setPassword}/>
                                </div>

                                <div>
                                    <PrimaryButton>Log in</PrimaryButton>
                                </div>

                                <div className="mt-8 text-sm">
                                    <p className="mb-3">
                                        <Link className="font-semibold" href="/signup">Register as a new user</Link>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </form>

                    {/* Divider */}
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-gray-50 text-gray-500">Or</span>
                        </div>
                    </div>

                    {/* GitHub Sign In */}
                    <a
                        href={apiUrl('/auth/github')}
                        className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-lg transition-colors shadow"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                        </svg>
                        Sign in with GitHub
                    </a>
                </section>
            </ApiStateContext.Provider>

        </>
    )
}

export default function SignIn() {
    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6">Use a local account to log in.</h1>
            <Suspense fallback={<div>Loading...</div>}>
                <SignInContent />
            </Suspense>
        </div>
    )
}
