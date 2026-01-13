const $ = id => document.getElementById(id);

// --- Audio for Alarm & Fake Call ---
const alarmAudio = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
const ringtone = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-cell-phone-ringing-vibration-20.mp3');

alarmAudio.loop = true;
ringtone.loop = true;
let isAlarmOn = false; // Declared at the top to avoid errors

function showOutput(msg) {
    if ($('output')) $('output').innerText = msg;
}

// Helper to "Unlock" audio on first click (Crucial for Mobile/Chrome)
const unlockAudio = () => {
    alarmAudio.play().then(() => {
        alarmAudio.pause();
        alarmAudio.currentTime = 0;
    }).catch(e => console.log("Audio unlock waiting..."));
    
    ringtone.play().then(() => {
        ringtone.pause();
        ringtone.currentTime = 0;
    }).catch(e => console.log("Audio unlock waiting..."));
    
    document.removeEventListener('click', unlockAudio);
};
document.addEventListener('click', unlockAudio);

// --- 1. Auth State Management ---
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    $('loggedIn').style.display = 'block';
    $('loggedOut').style.display = 'none';
    $('currentName').innerText = user.displayName;
    checkZoneSafety(); 
    loadContacts(user.uid);
  } else {
    $('loggedIn').style.display = 'none';
    $('loggedOut').style.display = 'block';
  }
});

$('loginBtn').onclick = () => firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
$('logoutBtn').onclick = () => firebase.auth().signOut();

// --- 2. Smart SOS Logic ---
const triggerSOS = async () => {
  showOutput("🚨 SOS ACTIVATED! Fetching location...");
  
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
    const user = firebase.auth().currentUser;
      
    await db.collection('alerts').add({
      uid: user.uid,
      userName: user.displayName,
      location: mapLink,
      time: firebase.firestore.FieldValue.serverTimestamp()
    });

    const userDoc = await db.collection('users').doc(user.uid).get();
    const contacts = userDoc.exists ? (userDoc.data().contacts || []) : [];

    if (contacts.length > 0) {
      const primaryContact = contacts[0].phone;
      const msg = encodeURIComponent(`🚨 EMERGENCY! AstraShe Alert from ${user.displayName}. I need help! My location: ${mapLink}`);
      window.open(`https://wa.me/${primaryContact}?text=${msg}`, '_blank');
      showOutput("SOS Sent to Primary Contact!");
    } else {
      showOutput("SOS Logged! Add contacts for WhatsApp alerts.");
    }
  }, err => showOutput("Location Error: " + err.message));
};

$('sosBtn').onclick = triggerSOS;

// --- 3. Shake Detection ---
let lastShake = 0;
window.addEventListener('devicemotion', (event) => {
    let acc = event.accelerationIncludingGravity;
    if(!acc) return;
    let totalAcc = Math.abs(acc.x) + Math.abs(acc.y);
    if (totalAcc > 25) {
        let now = Date.now();
        if (now - lastShake > 5000) {
            lastShake = now;
            triggerSOS();
        }
    }
});

// --- 4. Fake Call Simulator ---
$('fakeCallBtn').onclick = () => {
    showOutput("📞 Fake call starting in 5 seconds...");
    setTimeout(() => {
        $('fakeCallScreen').style.display = 'block';
        ringtone.play().catch(e => console.log("Sound blocked"));
    }, 5000);
};

window.stopFakeCall = function() {
    $('fakeCallScreen').style.display = 'none';
    ringtone.pause();
    ringtone.currentTime = 0;
    showOutput("Call ended.");
}

// --- 5. Unsafe Zone Awareness ---
async function checkZoneSafety() {
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const indicator = $('zoneIndicator');
        const unsafePlaces = await db.collection('places').where('type', '==', 'unsafe').get();
        let nearUnsafe = false;
        unsafePlaces.forEach(doc => {
            let data = doc.data();
            let dist = Math.abs(data.lat - pos.coords.latitude) + Math.abs(data.lng - pos.coords.longitude);
            if (dist < 0.005) nearUnsafe = true;
        });
        indicator.className = nearUnsafe ? "zone-banner unsafe" : "zone-banner safe";
        indicator.innerText = nearUnsafe ? "⚠️ Warning: Near unsafe zone." : "📍 Status: Zone Analysis Safe";
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
    checkZoneSafety();
  });
}
$('tagSafeBtn').onclick = () => handleTag('safe');
$('tagUnsafeBtn').onclick = () => handleTag('unsafe');

// --- 7. Alarm Feature ---
$('alarmBtn').onclick = () => {
  if (!isAlarmOn) {
    alarmAudio.play().catch(() => showOutput("Click screen first!"));
    $('alarmBtn').innerText = "🛑 STOP ALARM";
    $('alarmBtn').style.background = "black";
    showOutput("ALARM RINGING");
    isAlarmOn = true;
  } else {
    alarmAudio.pause();
    $('alarmBtn').innerText = "🔔 TRIGGER LOUD ALARM";
    $('alarmBtn').style.background = "#ff69b4";
    isAlarmOn = false;
  }
};

// --- 8. Contact Management ---
window.toggleContacts = () => {
    const modal = $('contactsModal');
    modal.style.display = (modal.style.display === 'none') ? 'flex' : 'none';
}
$('contactsBtn').onclick = toggleContacts;

window.addContact = async () => {
    const name = $('cName').value;
    const phone = $('cPhone').value;
    const user = firebase.auth().currentUser;
    if (name && phone) {
        await db.collection('users').doc(user.uid).set({
            contacts: firebase.firestore.FieldValue.arrayUnion({ name, phone })
        }, { merge: true });
        $('cName').value = "";
        $('cPhone').value = "";
        loadContacts(user.uid);
        showOutput("Contact added!");
    }
}

function loadContacts(uid) {
    db.collection('users').doc(uid).get().then(doc => {
        const list = $('contactList');
        list.innerHTML = "";
        if (doc.exists && doc.data().contacts) {
            doc.data().contacts.forEach(c => {
                list.innerHTML += `<li>${c.name}: ${c.phone}</li>`;
            });
        }
    });
}

// --- 9. Utility Functions ---
window.findNearby = (type) => {
    window.open(`https://www.google.com/maps/search/${type}+near+me`, '_blank');
};

window.toggleRiskMode = () => {
    const indicator = $('zoneIndicator');
    indicator.classList.toggle('safe');
    indicator.classList.toggle('unsafe');
    indicator.innerText = indicator.classList.contains('unsafe') ? "⚠️ Risk Mode Active" : "📍 Status: Zone Analysis Safe";
}

