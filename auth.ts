import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
        MicrosoftEntraID({
            clientId: process.env.AZURE_AD_CLIENT_ID,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
            issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
        }),
    ],
    trustHost: true,
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async session({ session, token }: any) {
            if (token) {
                session.user.id = token.sub;
                // Gələcəkdə rol idarəetməsini bura əlavə edə bilərik
                session.user.role = "ADMIN";
            }
            return session;
        },
        async jwt({ token, user }: any) {
            if (user) {
                token.role = "ADMIN";
            }
            return token;
        },
    },
});
