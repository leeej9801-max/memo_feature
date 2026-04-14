FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Expose Vite dev port
EXPOSE 5173

# Command to run Vite dev server
# Need --host to allow external access
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
