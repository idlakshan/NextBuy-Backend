import jwt from "jsonwebtoken";

const generatedAccessToken = (userId) => {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.SECRET_KEY_ACCESS_TOKEN,
    { expiresIn: "1h" }
  );
  return accessToken;
};

export default generatedAccessToken;
