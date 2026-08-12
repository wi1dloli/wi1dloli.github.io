let state = JSON.parse(localStorage.getItem('mtg_state')) || {
    lifeTotal: 40,
    tokens: [] 
};

function saveToStorage() {
    localStorage.setItem('mtg_state', JSON.stringify(state));
}

function adjustLife(amount) {
    state.lifeTotal += amount;
    saveToStorage();
    render();
}

// --- SCRYFALL API ASYNC WORKFLOW ---

// 1. Live input listener for autocomplete suggestions
async function handleNameInput(query) {
    const box = document.getElementById('autocomplete-box');
    if (!query || query.length < 2) {
        box.innerHTML = '';
        return;
    }

    try {
        const response = await fetch(`https://scryfall.com{encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            box.innerHTML = data.data.map(name => `
                <div class="suggestion-item" onclick="selectSuggestion('${name.replace(/'/g, "\\'")}')">${name}</div>
            `).join('');
        } else {
            box.innerHTML = '';
        }
    } catch (err) {
        console.error("Autocomplete error:", err);
    }
}

// 2. Event function when clicking a dropdown selection option
function selectSuggestion(name) {
    document.getElementById('token-name').value = name;
    document.getElementById('autocomplete-box').innerHTML = '';
}

// 3. Central submit callback execution logic interceptor
async function handleNewToken(event) {
    event.preventDefault();
    
    const nameInput = document.getElementById('token-name');
    const powInput = document.getElementById('token-pow');
    const touInput = document.getElementById('token-tou');
    const qtyInput = document.getElementById('token-qty-input');
    const colorInput = document.getElementById('token-color');

    const amountToCreate = parseInt(qtyInput.value);
    let imageUrl = '';
    let rulesText = '';

    document.getElementById('autocomplete-box').innerHTML = '';

    try {
        const response = await fetch(`https://scryfall.com{encodeURIComponent(nameInput.value)}`);
        if (response.ok) {
            const cardData = await response.json();
            
            // Extract standard or high-res art asset pipelines
            if (cardData.image_uris) {
                imageUrl = cardData.image_uris.normal;
            } else if (cardData.card_faces && cardData.card_faces.image_uris) {
                imageUrl = cardData.card_faces.image_uris.normal;
            }
            
            // Extract official ability oracle rules text
            rulesText = cardData.oracle_text || '';
            
            // Sync default oracle metrics if user hasn't overwritten fields manually
            if (cardData.power !== undefined) powInput.value = cardData.power;
            if (cardData.toughness !== undefined) touInput.value = cardData.toughness;
        }
    } catch (err) {
        console.log("Not a standard card or offline network mode, skipping art pipeline.");
    }

    for (let i = 0; i < amountToCreate; i++) {
        const uniqueId = `${Date.now()}-${i}-${Math.random()}`;
        
        const newToken = {
            id: uniqueId,
            name: nameInput.value,
            pow: powInput.value, // Keep as text to support '*' stats
            tou: touInput.value,
            color: colorInput.value,
            counters: 0, 
            tapped: false,
            artUrl: imageUrl,    // Save API artwork link directly
            rules: rulesText     // Save API text string
        };
        state.tokens.push(newToken);
    }
    
    nameInput.value = '';
    powInput.value = '1';
    touInput.value = '1';
    qtyInput.value = '1';
    colorInput.value = 'M';

    saveToStorage();
    render();
}

function adjustCounters(id, amount) {
    const token = state.tokens.find(t => t.id === id);
    if (token) {
        token.counters += amount;
        saveToStorage();
        render();
    }
}

function toggleTap(id) {
    const token = state.tokens.find(t => t.id === id);
    if (token) {
        token.tapped = !token.tapped;
        saveToStorage();
        render();
    }
}

function deleteToken(id) {
    state.tokens = state.tokens.filter(t => t.id !== id);
    saveToStorage();
    render();
}

// 4. UI Interface Sync Loop compiler
function render() {
    document.getElementById('life-display').textContent = state.lifeTotal;

    const grid = document.getElementById('token-grid');
    grid.innerHTML = ''; 

    state.tokens.forEach(token => {
        const card = document.createElement('div');
        
        // Apply art background identifier rules dynamically if a url handle is found
        if (token.artUrl) {
            card.className = `token-card has-art ${token.tapped ? 'tapped' : ''}`;
            card.style.backgroundImage = `url('${token.artUrl}')`;
        } else {
            card.className = `token-card clr-${token.color} ${token.tapped ? 'tapped' : ''}`;
            card.style.backgroundImage = 'none';
        }
        
        // Calculate power display strings securely
        let pDisplay = token.pow;
        let tDisplay = token.tou;
        
        if (!isNaN(parseInt(token.pow))) pDisplay = parseInt(token.pow) + token.counters;
        if (!isNaN(parseInt(token.tou))) tDisplay = parseInt(token.tou) + token.counters;

        card.innerHTML = `
            <div class="token-header">
                <span class="token-title">${token.name}</span>
                <button class="btn-delete" onclick="deleteToken('${token.id}')">✕</button>
            </div>
            
            <div class="token-pt">${pDisplay}/${tDisplay}</div>
            
            <!-- Injected Rules Box -->
            <div class="token-rules">${token.rules || ''}</div>
            
            <div class="counter-badge">
                ${token.counters >= 0 ? '+' : ''}${token.counters} Counters
            </div>
            
            <div class="token-controls">
                <button class="btn-sm" onclick="adjustCounters('${token.id}', -1)">Ctr -1</button>
                <button class="btn-sm" onclick="adjustCounters('${token.id}', 1)">Ctr +1</button>
            </div>
            
            <button class="btn-tap" onclick="toggleTap('${token.id}')">
                ${token.tapped ? 'UNTAP' : 'TAP'}
            </button>
        `;
        grid.appendChild(card);
    });
}

// Hide autocomplete box overlay list if clicking outside the text field form area
document.addEventListener('click', (e) => {
    if (e.target.id !== 'token-name') {
        const box = document.getElementById('autocomplete-box');
        if (box) box.innerHTML = '';
    }
});

render();
