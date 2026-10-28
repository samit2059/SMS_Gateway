import { NextFunction, Request, Response } from "express";
import { authService } from "./auth.service.js";

export const authController ={
    async register(req:Request, res:Response,next:NextFunction){
        try{
            const {email, password, name} = req.body;

            const user = await authService.register(email, password, name);

            return res.status(201).json({
                message:"User Registered successfully",
                email: user.email,
                id: user.id
            });
        }
        catch(err){
            next(err);
            console.log(err);
        }
    },

    async login(req:Request, res:Response, next:NextFunction){
        try{
            const {email, password} = req.body;

            // const user = await authService.login(email,password);
            if(!email || !password){
                return res.status(400).json({message:"Email and password are required"});
            }
            const {user, token} = await authService.login(email,password);

            return res.status(200).json({
                message:"Login Successfully",
                token,
                user:{id:user.id, email:user.email},
            });

        }
        catch(err){
            next(err)
        }
    }
}
