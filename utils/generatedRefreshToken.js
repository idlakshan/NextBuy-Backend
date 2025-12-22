import jwt from "jsonwebtoken";
import UserModel from "../models/user.model.js";

const generatedRefreshToken = async (userId) => {
   // console.log("Creating REFRESH token (10m)");
  const refreshToken = jwt.sign(
    { id: userId },
    process.env.SECRET_KEY_REFRESH_TOKEN,
    { expiresIn: "7d" }
  );

  const user = await UserModel.updateOne(
    { _id: userId },
    { refresh_token: refreshToken }
  );

  return refreshToken;
};

export default generatedRefreshToken;