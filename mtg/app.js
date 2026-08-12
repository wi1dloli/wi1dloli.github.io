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

function handleNewToken(event) {
    event.preventDefault();
    
    const nameInput = document.getElementById('token-name');
    const powInput = document.getElementById('token-pow');
    const touInput = document.getElementById('token-tou');
    const qtyInput = document.getElementById('token-qty-input');
    const colorInput = document.getElementById('token-color');

    const amountToCreate = parseInt(qtyInput.value);

    // Loop runs multiple times to build completely separate item instances
    for (let i = 0; i < amountToCreate; i++) {
        const uniqueId = `${Date.now()}-${i}-${Math.random()}`;
        
        const newToken = {
            id: uniqueId,
            name: nameInput.value,
            pow: parseInt(powInput.value),
            tou: parseInt(touInput.value),
            color: colorInput.value,
            counters: 0, 
            tapped: false
        };
        state.tokens.push(newToken);
    }
    
    // Clear the form fields back to defaults
    nameInput.value = '';
    powInput.value = '1';
    touInput.value = '1';
    qtyInput.value = '1';
    colorInput.value = 'W';

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

function render() {
    document.getElementById('life-display').textContent = state.lifeTotal;

    const grid = document.getElementById('token-grid');
    grid.innerHTML = ''; 

    state.tokens.forEach(token => {
        const card = document.createElement('div');
        card.className = `token-card clr-${token.color} ${token.tapped ? 'tapped' : ''}`;
        
        const totalPow = token.pow + token.counters;
        const totalTou = token.tou + token.counters;

        // FIXED: Added escaped quotes (\') around token.id so the browser reads it as text
        card.innerHTML = `
            <div class="token-header">
                <span class="token-title">${token.name}</span>
                <button class="btn-delete" onclick="deleteToken(\`${token.id}\`)">✕</button>
            </div>
            
            <div class="token-pt">${totalPow}/${totalTou}</div>
            
            <div class="counter-badge">
                ${token.counters >= 0 ? '' : ''}${token.counters} Counters
            </div>
            
            <div class="token-controls">
                <button class="btn-sm" onclick="adjustCounters(\`${token.id}\`, -1)">-1 / -1</button>
                <button class="btn-sm" onclick="adjustCounters(\`${token.id}\`, 1)"> +1 / +1</button>
            </div>
            
            <button class="btn-tap" onclick="toggleTap(\`${token.id}\`)">
                ${token.tapped ? 'UNTAP' : 'TAP'}
            </button>
        `;
        grid.appendChild(card);
    });
}

render();
