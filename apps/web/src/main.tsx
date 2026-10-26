import React from 'react';
import {createRoot} from 'react-dom/client';
import {LoopProvider} from '@theloop/client';
import type {LoopState} from '@theloop/core';
import App from './App';
import './styles.css';
import './polish.css';
const config=import.meta.env.VITE_FIREBASE_API_KEY?{apiKey:import.meta.env.VITE_FIREBASE_API_KEY,authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,storageBucket:import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,appId:import.meta.env.VITE_FIREBASE_APP_ID}:undefined;
createRoot(document.getElementById('root')!).render(<React.StrictMode><LoopProvider firebaseConfig={config} useEmulators={import.meta.env.VITE_USE_EMULATORS==='true'} emulators={{host:import.meta.env.VITE_EMULATOR_HOST||'127.0.0.1',authPort:Number(import.meta.env.VITE_EMULATOR_AUTH_PORT||9099),firestorePort:Number(import.meta.env.VITE_EMULATOR_FIRESTORE_PORT||8080),functionsPort:Number(import.meta.env.VITE_EMULATOR_FUNCTIONS_PORT||5001)}} storage={{load:async()=>{const value=localStorage.getItem('theloop-preview-v1');return value?JSON.parse(value) as LoopState:null;},save:async state=>localStorage.setItem('theloop-preview-v1',JSON.stringify(state))}}><App/></LoopProvider></React.StrictMode>);
