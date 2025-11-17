'use client'

import {serializeToObject} from "@servicestack/client"
import {SyntheticEvent, Suspense, useEffect, useState} from "react"
import {useRouter, useSearchParams} from "next/navigation"
import Link from "next/link"

import {ErrorSummary, TextInput, PrimaryButton, SecondaryButton, useClient, ApiStateContext} from "@servicestack/react"
import {appAuth, Redirecting} from "@/lib/auth/"
import {getRedirect} from "@/lib/api/gateway"
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
                <section className="mt-4 max-w-xl sm:shadow overflow-hidden sm:rounded-md">
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
