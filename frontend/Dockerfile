FROM node:20-slim

WORKDIR /app

# Accept build arg for Vite env variable
ARG VITE_APP_FASTAPI_URL=http://aiedu.tplinkdns.com:6051
ENV VITE_APP_FASTAPI_URL=${VITE_APP_FASTAPI_URL}

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Expose Vite dev port
EXPOSE 80

# Command to run Vite dev server
# Need --host to allow external access
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
