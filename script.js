const $ = id => document.getElementById(id);



// --- Audio for Alarm & Fake Call ---
const alarmAudio = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
const ringtone = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-cell-phone-ringing-vibration-20.mp3');

alarmAudio.loop = true;

// Helper to "Unlock" audio on first click (Crucial for Mobile)
const unlockAudio = () => {
    alarmAudio.play().then(() => {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
    }).catch(e => console.log("Audio unlock waiting for user..."));
    
    ringtone.play().then(() => {
        ringtone.pause();
        ringtone.currentTime = 0;
    }).catch(e => console.log("Audio unlock waiting for user..."));
    
    // Remove listener after first click to save performance
    document.removeEventListener('click', unlockAudio);
};

document.addEventListener('click', unlockAudio);

$('alarmBtn').onclick = () => {
  if (!isAlarmOn) {
    alarmAudio.play().catch(err => showOutput("Error: Click anywhere on page first!"));
    $('alarmBtn').innerText = "🛑 STOP ALARM";
    $('alarmBtn').style.background = "black";
    showOutput("ALARM RINGING AT MAX VOLUME");
    isAlarmOn = true;
  } else {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    $('alarmBtn').innerText = "🔔 TRIGGER LOUD ALARM";
    $('alarmBtn').style.background = "#ff69b4";
    isAlarmOn = false;
  }
};

// --- 1. Auth State Management ---
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    $('loggedIn').style.display = 'block';
    $('loggedOut').style.display = 'none';
    $('currentName').innerText = user.displayName;
    checkZoneSafety(); // Check if current area is safe on login
  } else {
    $('loggedIn').style.display = 'none';
    $('loggedOut').style.display = 'block';
  }
});

$('loginBtn').onclick = () => firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
$('logoutBtn').onclick = () => firebase.auth().signOut();

// --- 2. Smart SOS Logic (Manual & Shake Trigger) ---
const triggerSOS = async () => {
  showOutput("🚨 SOS ACTIVATED! Fetching location...");
  
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
    const user = firebase.auth().currentUser;

      
    // Record in Firestore
    await db.collection('alerts').add({
      uid: user.uid,
      userName: user.displayName,
      location: mapLink,
      time: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Send WhatsApp to Primary Contact
    const userDoc = await db.collection('users').doc(user.uid).get();
    const contacts = userDoc.exists ? (userDoc.data().contacts || []) : [];

    if (contacts.length > 0) {
      const primaryContact = contacts[0].phone;
      const msg = encodeURIComponent(`🚨 EMERGENCY! AstraShe Alert from ${user.displayName}. I need help! My live location: ${mapLink}`);
      window.open(`https://wa.me/${primaryContact}?text=${msg}`, '_blank');
      showOutput("SOS Sent! Audio/Location Logged.");
    } else {
      showOutput("SOS Logged! No contacts found to message.");
    }
  }, err => showOutput("Location Error: " + err.message));
};

$('sosBtn').onclick = triggerSOS;

// --- 3. Shake Detection (Smart SOS Feature) ---
let lastShake = 0;
window.addEventListener('devicemotion', (event) => {
    let acc = event.accelerationIncludingGravity;
    let totalAcc = Math.abs(acc.x) + Math.abs(acc.y);
    
    if (totalAcc > 25) { // Sensitivity threshold
        let now = Date.now();
        if (now - lastShake > 5000) { // Prevent double-triggering
            lastShake = now;
            triggerSOS();
        }
    }
});

// --- 4. Fake Call Simulator (Robust Version) ---
// --- 4. Fake Call Simulator (Final Bulletproof Version) ---
const ringtone = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-cell-phone-ringing-vibration-20.mp3');
ringtone.loop = true;

$('fakeCallBtn').onclick = () => {
    showOutput("📞 Fake call starting in 5 seconds...");
    
    setTimeout(() => {
        // 1. Show the fake call screen
        $('fakeCallScreen').style.display = 'block';
        
        // 2. Play the sound
        ringtone.play().catch(e => {
            console.log("Sound blocked, but screen is showing.");
            showOutput("Call incoming (Sound blocked by browser)");
        });
        
        showOutput("Incoming Call...");
    }, 5000);
};

// Function to stop the call (linked to the buttons in HTML)
function stopFakeCall() {
    $('fakeCallScreen').style.display = 'none';
    ringtone.pause();
    ringtone.currentTime = 0;
    showOutput("Call ended.");
}
// --- 5. Unsafe Zone Awareness (AI-Lite) ---
async function checkZoneSafety() {
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const indicator = $('zoneIndicator');
        // Logic: Check Firestore 'places' to see if anyone tagged this area 'unsafe'
        const unsafePlaces = await db.collection('places').where('type', '==', 'unsafe').get();
        
        let nearUnsafe = false;
        unsafePlaces.forEach(doc => {
            let data = doc.data();
            // Basic proximity check (Roughly 500 meters)
            let dist = Math.abs(data.lat - pos.coords.latitude) + Math.abs(data.lng - pos.coords.longitude);
            if (dist < 0.005) nearUnsafe = true;
        });

        if (nearUnsafe) {
            indicator.className = "zone-banner unsafe";
            indicator.innerText = "⚠️ Warning: You are near a reported unsafe zone.";
        } else {
            indicator.className = "zone-banner safe";
            indicator.innerText = "📍 Status: Zone Analysis Safe";
        }
    });
}

// --- 6. Tag Safe/Unsafe Places ---
async function handleTag(type) {
  showOutput(`Tagging current location as ${type}...`);
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const user = firebase.auth().currentUser;
    await db.collection('places').add({
      uid: user.uid,
      type: type,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      time: firebase.firestore.FieldValue.serverTimestamp()
    });
    showOutput(`Successfully marked as ${type.toUpperCase()}.`);
    checkZoneSafety(); // Refresh banner
  });
}

$('tagSafeBtn').onclick = () => handleTag('safe');
$('tagUnsafeBtn').onclick = () => handleTag('unsafe');

// --- 7. Alarm Feature ---
let isAlarmOn = false;
$('alarmBtn').onclick = () => {
  if (!isAlarmOn) {
    alarmAudio.play();
    $('alarmBtn').innerText = "🛑 STOP ALARM";
    $('alarmBtn').style.background = "black";
    showOutput("ALARM RINGING AT MAX VOLUME");
    isAlarmOn = true;
  } else {
    alarmAudio.pause();
    $('alarmBtn').innerText = "🔔 TRIGGER LOUD ALARM";
    $('alarmBtn').style.background = "#ff69b4";
    isAlarmOn = false;
  }
};

// --- 8. Manage Contacts ---
$('contactsBtn').onclick = async () => {
  const name = prompt("Contact Name:");
  const phone = prompt("WhatsApp Number (Include Country Code, e.g., 919876543210):");
  if (name && phone) {
    const user = firebase.auth().currentUser;
    await db.collection('users').doc(user.uid).set({
      contacts: firebase.firestore.FieldValue.arrayUnion({ name, phone })
    }, { merge: true });
    showOutput("Contact added successfully.");
  }
};

// Function for Nearby Resources
function findNearby(type) {
    window.open(`https://www.google.com/maps/search/${type}+near+me`, '_blank');
}


window.findNearby = (type) => {
    window.open(`https://www.google.com/maps/search/${type}+near+me`, '_blank');
};
