// ============================================================
// WI1DTRACK - MTG GAME TRACKER
// Token-only + single-faced + artifact-aware Scryfall search
// ============================================================

const STORAGE_KEY = 'mtg_state';
const SCRYFALL_API = 'https://api.scryfall.com';


// ============================================================
// STATE
// ============================================================

let state = loadState();

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);

        if (!saved) {
            return {
                lifeTotal: 40,
                tokens: []
            };
        }

        const parsed = JSON.parse(saved);

        return {
            lifeTotal:
                typeof parsed.lifeTotal === 'number'
                    ? parsed.lifeTotal
                    : 40,

            tokens:
                Array.isArray(parsed.tokens)
                    ? parsed.tokens
                    : []
        };

    } catch (error) {
        console.error(
            'Could not load saved game state:',
            error
        );

        return {
            lifeTotal: 40,
            tokens: []
        };
    }
}


function saveToStorage() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(state)
        );
    } catch (error) {
        console.error(
            'Could not save game state:',
            error
        );
    }
}


// ============================================================
// LIFE
// ============================================================

function adjustLife(amount) {
    state.lifeTotal += amount;

    saveToStorage();
    render();
}


// ============================================================
// TOKEN VALIDATION
// ============================================================

function isSingleFacedToken(card) {
    if (!card) {
        return false;
    }


    /*
     * Double-faced cards are excluded.
     *
     * This removes things such as:
     *
     * Dinosaur // Treasure
     */
    if (Array.isArray(card.card_faces)) {
        return false;
    }


    return true;
}


// ============================================================
// ARTIFACT DETECTION
// ============================================================

function isArtifactToken(card) {
    if (!card) {
        return false;
    }


    /*
     * Scryfall's type_line contains values such as:
     *
     * "Artifact Token"
     * "Artifact Creature Token"
     * "Token Artifact — Clue"
     *
     * We check for the word "Artifact".
     */
    const typeLine =
        card.type_line || '';


    return /\bArtifact\b/i.test(typeLine);
}


// ============================================================
// SCRYFALL AUTOCOMPLETE
// ============================================================

let autocompleteTimer = null;
let autocompleteRequest = 0;


async function handleNameInput(query) {
    const box =
        document.getElementById(
            'autocomplete-box'
        );


    if (!box) {
        return;
    }


    clearTimeout(autocompleteTimer);

    query = query.trim();


    if (query.length < 2) {
        box.innerHTML = '';
        return;
    }


    autocompleteTimer = setTimeout(async () => {
        const requestNumber =
            ++autocompleteRequest;


        try {
            /*
             * Search specifically for tokens whose names
             * begin with the entered text.
             */
            const searchQuery =
                `t:token name:${query}*`;


            const url =
                `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(searchQuery)}`;


            const response =
                await fetch(url);


            if (!response.ok) {
                throw new Error(
                    `Scryfall token search returned HTTP ${response.status}`
                );
            }


            const data =
                await response.json();


            // Ignore an old request.
            if (
                requestNumber !== autocompleteRequest
            ) {
                return;
            }


            box.innerHTML = '';


            if (!Array.isArray(data.data)) {
                return;
            }


            /*
             * Only display single-faced tokens.
             */
            const validTokens =
                data.data.filter(
                    card => isSingleFacedToken(card)
                );


            /*
             * Remove duplicate names.
             */
            const names = [
                ...new Set(
                    validTokens
                        .map(card => card.name)
                        .filter(Boolean)
                )
            ];


            names.forEach(name => {
                const suggestion =
                    document.createElement('div');


                suggestion.className =
                    'suggestion-item';


                suggestion.textContent =
                    name;


                suggestion.addEventListener(
                    'click',
                    () => {
                        selectSuggestion(name);
                    }
                );


                box.appendChild(suggestion);
            });


        } catch (error) {
            console.error(
                'Token autocomplete error:',
                error
            );


            if (
                requestNumber === autocompleteRequest
            ) {
                box.innerHTML = '';
            }
        }

    }, 250);
}


// ============================================================
// SELECT AUTOCOMPLETE SUGGESTION
// ============================================================

function selectSuggestion(name) {
    const input =
        document.getElementById(
            'token-name'
        );


    const box =
        document.getElementById(
            'autocomplete-box'
        );


    if (input) {
        input.value = name;
    }


    if (box) {
        box.innerHTML = '';
    }
}


// ============================================================
// FIND TOKEN
// ============================================================

async function findToken(tokenName) {
    const name =
        tokenName.trim();


    if (!name) {
        return null;
    }


    // --------------------------------------------------------
    // Exact token search
    // --------------------------------------------------------

    try {
        const searchQuery =
            `!"${name}" t:token`;


        const url =
            `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(searchQuery)}`;


        const response =
            await fetch(url);


        if (response.ok) {
            const data =
                await response.json();


            if (Array.isArray(data.data)) {
                const token =
                    data.data.find(
                        card => isSingleFacedToken(card)
                    );


                if (token) {
                    return token;
                }
            }
        }

    } catch (error) {
        console.warn(
            'Exact token lookup failed:',
            error
        );
    }


    // --------------------------------------------------------
    // Fuzzy token search
    // --------------------------------------------------------

    try {
        const searchQuery =
            `${name} t:token`;


        const url =
            `${SCRYFALL_API}/cards/search?q=${encodeURIComponent(searchQuery)}`;


        const response =
            await fetch(url);


        if (response.ok) {
            const data =
                await response.json();


            if (Array.isArray(data.data)) {
                const token =
                    data.data.find(
                        card => isSingleFacedToken(card)
                    );


                if (token) {
                    return token;
                }
            }
        }

    } catch (error) {
        console.warn(
            'Fuzzy token lookup failed:',
            error
        );
    }


    return null;
}


// ============================================================
// CARD IMAGE
// ============================================================

function getCardImage(card) {
    if (!card) {
        return '';
    }


    /*
     * Single-faced tokens only.
     */
    if (card.image_uris?.normal) {
        return card.image_uris.normal;
    }


    return '';
}


// ============================================================
// CARD RULES
// ============================================================

function getCardRules(card) {
    if (!card) {
        return '';
    }


    return card.oracle_text || '';
}


// ============================================================
// CARD POWER
// ============================================================

function getCardPower(card) {
    if (!card) {
        return null;
    }


    if (card.power !== undefined) {
        return card.power;
    }


    return null;
}


// ============================================================
// CARD TOUGHNESS
// ============================================================

function getCardToughness(card) {
    if (!card) {
        return null;
    }


    if (card.toughness !== undefined) {
        return card.toughness;
    }


    return null;
}


// ============================================================
// CREATE TOKENS
// ============================================================

async function handleNewToken(event) {
    event.preventDefault();


    const nameInput =
        document.getElementById(
            'token-name'
        );


    const powInput =
        document.getElementById(
            'token-pow'
        );


    const touInput =
        document.getElementById(
            'token-tou'
        );


    const qtyInput =
        document.getElementById(
            'token-qty-input'
        );


    const colorInput =
        document.getElementById(
            'token-color'
        );


    const autocompleteBox =
        document.getElementById(
            'autocomplete-box'
        );


    if (
        !nameInput ||
        !powInput ||
        !touInput ||
        !qtyInput ||
        !colorInput
    ) {
        console.error(
            'Token form elements are missing.'
        );

        return;
    }


    const name =
        nameInput.value.trim();


    if (!name) {
        return;
    }


    let quantity =
        parseInt(
            qtyInput.value,
            10
        );


    if (
        !Number.isFinite(quantity) ||
        quantity < 1
    ) {
        quantity = 1;
    }


    // Prevent accidental mass creation.
    quantity =
        Math.min(quantity, 100);


    if (autocompleteBox) {
        autocompleteBox.innerHTML = '';
    }


    let imageUrl = '';
    let rulesText = '';

    let power =
        powInput.value.trim() || '1';


    let toughness =
        touInput.value.trim() || '1';


    let artifactToken = false;


    // --------------------------------------------------------
    // Scryfall lookup
    // --------------------------------------------------------

    try {
        const card =
            await findToken(name);


        if (card) {
            imageUrl =
                getCardImage(card);


            rulesText =
                getCardRules(card);


            artifactToken =
                isArtifactToken(card);


            /*
             * Only replace P/T when this is a creature token.
             */
            if (!artifactToken) {
                const scryfallPower =
                    getCardPower(card);


                const scryfallToughness =
                    getCardToughness(card);


                if (scryfallPower !== null) {
                    power =
                        String(scryfallPower);
                }


                if (scryfallToughness !== null) {
                    toughness =
                        String(scryfallToughness);
                }
            }
        }

    } catch (error) {
        console.error(
            'Scryfall token lookup failed:',
            error
        );
    }


    // --------------------------------------------------------
    // Create tokens
    // --------------------------------------------------------

    for (let i = 0; i < quantity; i++) {
        state.tokens.push({
            id:
                `${Date.now()}-${i}-${Math.random()
                    .toString(36)
                    .slice(2)}`,

            name: name,

            pow: artifactToken
                ? ''
                : power,

            tou: artifactToken
                ? ''
                : toughness,

            color:
                colorInput.value,

            counters: 0,

            tapped: false,

            artUrl: imageUrl,

            rules: rulesText,

            isArtifact: artifactToken
        });
    }


    // --------------------------------------------------------
    // Reset form
    // --------------------------------------------------------

    nameInput.value = '';

    powInput.value = '1';

    touInput.value = '1';

    qtyInput.value = '1';

    colorInput.value = 'M';


    saveToStorage();

    render();
}


// ============================================================
// TOKEN COUNTERS
// ============================================================

function adjustCounters(id, amount) {
    const token =
        state.tokens.find(
            token => token.id === id
        );


    if (!token) {
        return;
    }


    token.counters += amount;


    saveToStorage();

    render();
}


// ============================================================
// TAP / UNTAP
// ============================================================

function toggleTap(id) {
    const token =
        state.tokens.find(
            token => token.id === id
        );


    if (!token) {
        return;
    }


    token.tapped =
        !token.tapped;


    saveToStorage();

    render();
}


// ============================================================
// DELETE TOKEN
// ============================================================

function deleteToken(id) {
    state.tokens =
        state.tokens.filter(
            token => token.id !== id
        );


    saveToStorage();

    render();
}


// ============================================================
// HTML ESCAPING
// ============================================================

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


// ============================================================
// DISPLAY P/T
// ============================================================

function getDisplayedStat(
    baseValue,
    counters
) {
    const value =
        String(baseValue ?? '');


    /*
     * Numeric values receive counters.
     * Non-numeric values remain unchanged.
     */
    if (/^-?\d+$/.test(value)) {
        return (
            Number(value) +
            counters
        );
    }


    return value;
}


// ============================================================
// RENDER
// ============================================================

function render() {
    const lifeDisplay =
        document.getElementById(
            'life-display'
        );


    const grid =
        document.getElementById(
            'token-grid'
        );


    if (lifeDisplay) {
        lifeDisplay.textContent =
            state.lifeTotal;
    }


    if (!grid) {
        return;
    }


    grid.innerHTML = '';


    state.tokens.forEach(token => {
        const card =
            document.createElement('div');


        const tappedClass =
            token.tapped
                ? 'tapped'
                : '';


        // ----------------------------------------------------
        // Appearance
        // ----------------------------------------------------

        if (token.artUrl) {
            card.className =
                `token-card has-art ${tappedClass}`;


            card.style.backgroundImage =
                `url(${JSON.stringify(token.artUrl)})`;

        } else {
            card.className =
                `token-card clr-${token.color} ${tappedClass}`;


            card.style.backgroundImage =
                'none';
        }


        // ----------------------------------------------------
        // P/T
        // ----------------------------------------------------

        let ptDisplay = '';


        /*
         * Artifact tokens don't have P/T.
         *
         * The isArtifact property is stored when the token
         * is created, so the information survives refreshes.
         */
        if (!token.isArtifact) {
            const power =
                getDisplayedStat(
                    token.pow,
                    token.counters
                );


            const toughness =
                getDisplayedStat(
                    token.tou,
                    token.counters
                );


            /*
             * Only display P/T if there is actually something
             * to display.
             */
            if (
                power !== '' &&
                toughness !== ''
            ) {
                ptDisplay = `
                    <div class="token-pt">
                        ${escapeHtml(power)}/${escapeHtml(toughness)}
                    </div>
                `;
            }
        }


        // ----------------------------------------------------
        // Token HTML
        // ----------------------------------------------------

        card.innerHTML = `
            <div class="token-header">

                <span class="token-title">
                    ${escapeHtml(token.name)}
                </span>


                <button
                    type="button"
                    class="btn-delete"
                    data-action="delete"
                    data-id="${escapeHtml(token.id)}"
                    aria-label="Delete token"
                >
                    ✕
                </button>

            </div>


            ${ptDisplay}


            <div class="token-rules">
                ${escapeHtml(token.rules || '')}
            </div>


            <div class="counter-badge">
                ${token.counters >= 0 ? '' : ''}
                ${token.counters}
                Counters
            </div>


            <div class="token-controls">

                <button
                    type="button"
                    class="btn-sm"
                    data-action="counter-down"
                    data-id="${escapeHtml(token.id)}"
                >
                    -1
                </button>


                <button
                    type="button"
                    class="btn-sm"
                    data-action="counter-up"
                    data-id="${escapeHtml(token.id)}"
                >
                    + 1
                </button>

            </div>


            <button
                type="button"
                class="btn-tap"
                data-action="tap"
                data-id="${escapeHtml(token.id)}"
            >
                ${token.tapped ? 'UNTAP' : 'TAP'}
            </button>
        `;


        grid.appendChild(card);
    });
}


// ============================================================
// TOKEN BUTTON EVENTS
// ============================================================

function handleTokenGridClick(event) {
    const button =
        event.target.closest(
            'button[data-action]'
        );


    if (!button) {
        return;
    }


    const action =
        button.dataset.action;


    const id =
        button.dataset.id;


    if (!id) {
        return;
    }


    switch (action) {
        case 'delete':
            deleteToken(id);
            break;


        case 'counter-down':
            adjustCounters(id, -1);
            break;


        case 'counter-up':
            adjustCounters(id, 1);
            break;


        case 'tap':
            toggleTap(id);
            break;
    }
}


// ============================================================
// CLOSE AUTOCOMPLETE
// ============================================================

function handleDocumentClick(event) {
    const input =
        document.getElementById(
            'token-name'
        );


    const box =
        document.getElementById(
            'autocomplete-box'
        );


    if (!input || !box) {
        return;
    }


    if (
        event.target === input ||
        box.contains(event.target)
    ) {
        return;
    }


    box.innerHTML = '';
}


// ============================================================
// ESC KEY
// ============================================================

function handleNameKeydown(event) {
    if (event.key !== 'Escape') {
        return;
    }


    const box =
        document.getElementById(
            'autocomplete-box'
        );


    if (box) {
        box.innerHTML = '';
    }
}


// ============================================================
// INITIALIZATION
// ============================================================

function initializeApp() {
    const grid =
        document.getElementById(
            'token-grid'
        );


    const nameInput =
        document.getElementById(
            'token-name'
        );


    if (grid) {
        grid.addEventListener(
            'click',
            handleTokenGridClick
        );
    }


    if (nameInput) {
        nameInput.addEventListener(
            'keydown',
            handleNameKeydown
        );
    }


    document.addEventListener(
        'click',
        handleDocumentClick
    );


    render();
}


// ============================================================
// START APP
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener(
        'DOMContentLoaded',
        initializeApp
    );
} else {
    initializeApp();
}
