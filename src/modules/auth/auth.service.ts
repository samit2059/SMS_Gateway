import prisma from "../../lib/prisma.js"
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
export const authService = {    
    async register(email: string, password: string, name: string){
        const existingUser = await prisma.orm.public.User
            .where({email})
            .first();

        if(existingUser){
            throw Object.assign(new Error("Email already registered"),{
                statusCode:400,
            })
        }

        const passwordHash = await bcrypt.hash(password,10);
    const user = await prisma.transaction(async (tx) =>{
        const newUser = await tx.orm.public.User.create({
            email,
            passwordHash,
            name
        });

        const wallet = await tx.orm.public.Wallet.create({
                balance: 100, // seed credits for testing
                userId: newUser.id,
            });

            return {...newUser,wallet};
    });

    return user;
  },

  async login(email:string, password:string){
    const user = await prisma.orm.public.User
        .where({email})
        .first();

        if (!user || !user.passwordHash) {
            throw Object.assign(new Error("Invalid credentials"), {
                statusCode: 401,
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash)

        if (!isPasswordValid) {
            throw Object.assign(new Error("Invalid credentials"), {
                statusCode: 401,
            });
        }

        const token = jwt.sign(
            {sub: user.id},
            process.env.JWT_SECRET!,
            {expiresIn: process.env.JWT_EXPIRES_IN || "1d"} as jwt.SignOptions
        );
        return {user, token};
  },
}
