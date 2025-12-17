# Use a Node base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy both package.json and package-lock.json
COPY package*.json ./

# Install dependencies (axios will be installed here)
RUN npm install

# Copy the rest of the app
COPY . .

# Start the app
CMD ["npm", "run", "dev"]
