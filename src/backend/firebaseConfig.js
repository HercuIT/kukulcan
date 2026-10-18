import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCx4afXptrFwL4E9iGu58TzdV_DveXG5C0",
  authDomain: "xicotencatl.firebaseapp.com",
  projectId: "xicotencatl",
  storageBucket: "xicotencatl.appspot.com",
  messagingSenderId: "800043828128",
  appId: "1:800043828128:web:f2b22fc9024532fd5d1ac5",
  measurementId: "G-S6VY2K1WZN",
};

// Inicializa Firebase y exporta los servicios
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");
