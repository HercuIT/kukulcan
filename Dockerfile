# Stage 1: Build the application
# We use a node image to install dependencies and build the app.
FROM node:18-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json to leverage Docker's caching
# This ensures that npm install is not re-run every time you change a source file
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Run the build command as defined in your package.json
# This command will generate the production-ready static files
# The output directory is typically 'build', 'dist', or 'public'
# Ensure this matches your project's configuration
RUN npm run build

# Stage 2: Serve the application
# We use a lightweight web server like Nginx or a simple HTTP server
# to serve the static files. Nginx is a great choice for production.
FROM nginx:alpine

# Copy the build output from the 'builder' stage into the Nginx public directory
# The path /app/build should be changed if your build process outputs to a different folder
COPY --from=builder /app/build /usr/share/nginx/html

# Copy a custom nginx configuration file to the container
# This is an optional but good practice to ensure correct routing (e.g., for SPAs)
# You would need to create a file named nginx.conf in your project directory
# COPY nginx.conf /etc/nginx/nginx.conf

# Expose the port on which the application will run
# Nginx typically runs on port 80 by default
EXPOSE 80

# The default command for the Nginx image already starts the server,
# so we don't need a CMD instruction here.
