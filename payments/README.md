# To create project setup

npx tsc --init 
npm install express
npm install -D typescript ts-node-dev @types/express


 # "start": "ts-node-dev src/index.ts"
1. ts-node-dev runs your .ts file directly.
2. It restarts automatically when you change code.
3. You don’t have to manually compile anything while developing.

docker build -t <name>:<tag> <path>
Without -t, Docker would assign a random name and you’d have to remember an image ID to run it.