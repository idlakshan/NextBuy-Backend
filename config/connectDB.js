import mongoose from "mongoose";
import dotenv from 'dotenv'
import dns from "node:dns/promises";
dotenv.config();
dns.setServers(["1.1.1.1"]);

if(!process.env.MONGODB_URI){
 throw new Error("Please provide MongoDB URI in the .env file ")
}

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected DB');
        
    } catch (error) {
        console.log("MongoDB connection Failed ",error);
        process.exit(1)
    }
}

export default connectDB;