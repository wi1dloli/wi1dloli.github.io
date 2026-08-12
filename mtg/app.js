// ============================================================
// WI1DTRACK - MTG GAME TRACKER
// Token-only + single-faced + artifact-aware Scryfall search
// iOS 9.3.5 Compatible
// ============================================================

var STORAGE_KEY = 'mtg_state';
var SCRYFALL_API = 'https://api.scryfall.com';

// ============================================================
// POLYFILLS FOR iOS 9.3.5
// ============================================================

// Array.isArray polyfill
if (!Array.isArray) {
    Array.isArray = function(arg) {
        return Object.prototype.toString.call(arg) === '[object Array]';
    };
}

// Array.prototype.find polyfill
if (!Array.prototype.find) {
    Array.prototype.find = function(predicate) {
        if (this === null) {
            throw new TypeError('Array.prototype.find called on null or undefined');
        }
        if (typeof predicate !== 'function') {
            throw new TypeError('predicate must be a function');
        }
        var list = Object(this);
        var length = list.length >>> 0;
        var thisArg = arguments[1];
        var value;

        for (var i = 0; i < length; i++) {
            value = list[i];
            if (predicate.call(thisArg, value, i, list)) {
                return value;
            }
        }
        return undefined;
    };
}

// Array.prototype.filter polyfill
if (!Array.prototype.filter) {
    Array.prototype.filter = function(fun /*, thisArg*/) {
        if (this === void 0 || this === null) {
            throw new TypeError();
        }

        var t = Object(this);
        var len = t.length >>> 0;
        if (typeof fun !== 'function') {
            throw new TypeError();
        }

        var res = [];
        var thisArg = arguments.length >= 2 ? arguments[1] : void 0;
        for (var i = 0; i < len; i++) {
            if (i in t) {
                var val = t[i];
                if (fun.call(thisArg, val, i, t)) {
                    res.push(val);
                }
            }
        }
        return res;
    };
}

// ============================================================
// STATE
// ============================================================

var state = loadState();

function loadState() {
    try {
        var saved = localStorage.getItem(STORAGE_KEY);

        if (!saved) {
            return {
                lifeTotal: 40,
                tokens: []
            };
        }

        var parsed = JSON.parse(saved);

        return {
            lifeTotal: typeof parsed.lifeTotal === 'number' ? parsed.lifeTotal : 40,
            tokens: Array.isArray(parsed.tokens) ? parsed.tokens : []
        };

    } catch (error) {
        console.error('Could not load saved game state:', error);

        return {
            lifeTotal: 40,
            tokens: []
        };
    }
}

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error('Could not save game state:', error);
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

    // Double-faced cards are excluded.
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

    var typeLine = card.type_line || '';
    return /\bArtifact\b/i.test(typeLine);
}

// ============================================================
// ARTIFACT CREATURE DETECTION
// ============================================================

function isArtifactCreatureToken(card) {
    if (!card) {
        return false;
    }

    var typeLine = card.type_line || '';
    // Check if it's both an Artifact and a Creature
    return /\bArtifact\b/i.test(typeLine) && /\bCreature\b/i.test(typeLine);
}

// ============================================================
// SCRYFALL AUTOCOMPLETE
// ============================================================

var autocompleteTimer = null;
var autocompleteRequest = 0;

function handleNameInput(query) {
    var box = document.getElementById('autocomplete-box');

    if (!box) {
        return;
    }

    clearTimeout(autocompleteTimer);

    query = query.trim();

    if (query.length < 2) {
        box.innerHTML = '';
        return;
    }

    autocompleteTimer = setTimeout(function() {
        var requestNumber = ++autocompleteRequest;

        try {
            var searchQuery = 't:token name:' + query + '*';
            var url = SCRYFALL_API + '/cards/search?q=' + encodeURIComponent(searchQuery);

            fetch(url)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Scryfall token search returned HTTP ' + response.status);
                    }
                    return response.json();
                })
                .then(function(data) {
                    if (requestNumber !== autocompleteRequest) {
                        return;
                    }

                    box.innerHTML = '';

                    if (!Array.isArray(data.data)) {
                        return;
                    }

                    var validTokens = data.data.filter(function(card) {
                        return isSingleFacedToken(card);
                    });

                    var names = [];
                    for (var i = 0; i < validTokens.length; i++) {
                        var name = validTokens[i].name;
                        if (name && names.indexOf(name) === -1) {
                            names.push(name);
                        }
                    }

                    names.forEach(function(name) {
                        var suggestion = document.createElement('div');
                        suggestion.className = 'suggestion-item';
                        suggestion.textContent = name;

                        suggestion.addEventListener('click', function() {
                            selectSuggestion(name);
                        });

                        box.appendChild(suggestion);
                    });
                })
                .catch(function(error) {
                    console.error('Token autocomplete error:', error);
                    if (requestNumber === autocompleteRequest) {
                        box.innerHTML = '';
                    }
                });

        } catch (error) {
            console.error('Token autocomplete error:', error);
            if (requestNumber === autocompleteRequest) {
                box.innerHTML = '';
            }
        }
    }, 250);
}

// ============================================================
// SELECT AUTOCOMPLETE SUGGESTION
// ============================================================

function selectSuggestion(name) {
    var input = document.getElementById('token-name');
    var box = document.getElementById('autocomplete-box');

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

function findToken(tokenName) {
    var name = tokenName.trim();

    if (!name) {
        return Promise.resolve(null);
    }

    // Exact token search
    return new Promise(function(resolve) {
        var searchQuery = '!"' + name + '" t:token';
        var url = SCRYFALL_API + '/cards/search?q=' + encodeURIComponent(searchQuery);

        fetch(url)
            .then(function(response) {
                if (response.ok) {
                    return response.json();
                }
                return null;
            })
            .then(function(data) {
                if (data && Array.isArray(data.data)) {
                    var token = data.data.find(function(card) {
                        return isSingleFacedToken(card);
                    });

                    if (token) {
                        resolve(token);
                        return;
                    }
                }

                // Fuzzy token search
                var fuzzyQuery = name + ' t:token';
                var fuzzyUrl = SCRYFALL_API + '/cards/search?q=' + encodeURIComponent(fuzzyQuery);

                return fetch(fuzzyUrl);
            })
            .then(function(response) {
                if (!response) {
                    resolve(null);
                    return;
                }
                if (response.ok) {
                    return response.json();
                }
                return null;
            })
            .then(function(data) {
                if (data && Array.isArray(data.data)) {
                    var token = data.data.find(function(card) {
                        return isSingleFacedToken(card);
                    });

                    if (token) {
                        resolve(token);
                        return;
                    }
                }

                resolve(null);
            })
            .catch(function(error) {
                console.warn('Token lookup failed:', error);
                resolve(null);
            });
    });
}

// ============================================================
// CARD IMAGE
// ============================================================

function getCardImage(card) {
    if (!card) {
        return '';
    }

    if (card.image_uris && card.image_uris.normal) {
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

function handleNewToken(event) {
    event.preventDefault();

    var nameInput = document.getElementById('token-name');
    var powInput = document.getElementById('token-pow');
    var touInput = document.getElementById('token-tou');
    var qtyInput = document.getElementById('token-qty-input');
    var colorInput = document.getElementById('token-color');
    var autocompleteBox = document.getElementById('autocomplete-box');

    if (!nameInput || !powInput || !touInput || !qtyInput || !colorInput) {
        console.error('Token form elements are missing.');
        return;
    }

    var name = nameInput.value.trim();

    if (!name) {
        return;
    }

    var quantity = parseInt(qtyInput.value, 10);

    if (!isFinite(quantity) || quantity < 1) {
        quantity = 1;
    }

    quantity = Math.min(quantity, 100);

    if (autocompleteBox) {
        autocompleteBox.innerHTML = '';
    }

    var imageUrl = '';
    var rulesText = '';
    var power = powInput.value.trim() || '1';
    var toughness = touInput.value.trim() || '1';
    var isArtifact = false;
    var isArtifactCreature = false;

    // Scryfall lookup
    findToken(name)
        .then(function(card) {
            if (card) {
                imageUrl = getCardImage(card);
                rulesText = getCardRules(card);
                isArtifact = isArtifactToken(card);
                isArtifactCreature = isArtifactCreatureToken(card);

                // Only replace P/T for creatures (including artifact creatures)
                // Non-creature artifacts should keep their P/T fields empty
                if (!isArtifact || isArtifactCreature) {
                    var scryfallPower = getCardPower(card);
                    var scryfallToughness = getCardToughness(card);

                    if (scryfallPower !== null && scryfallPower !== undefined) {
                        power = String(scryfallPower);
                    }

                    if (scryfallToughness !== null && scryfallToughness !== undefined) {
                        toughness = String(scryfallToughness);
                    }
                } else {
                    // Non-creature artifacts - clear P/T
                    power = '';
                    toughness = '';
                }
            }

            // Create tokens
            for (var i = 0; i < quantity; i++) {
                state.tokens.push({
                    id: Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2),
                    name: name,
                    pow: power,
                    tou: toughness,
                    color: colorInput.value,
                    counters: 0,
                    tapped: false,
                    artUrl: imageUrl,
                    rules: rulesText,
                    isArtifact: isArtifact,
                    isArtifactCreature: isArtifactCreature
                });
            }

            // Reset form
            nameInput.value = '';
            powInput.value = '1';
            touInput.value = '1';
            qtyInput.value = '1';
            colorInput.value = 'M';

            saveToStorage();
            render();
        })
        .catch(function(error) {
            console.error('Scryfall token lookup failed:', error);

            // Still create tokens even if lookup fails
            for (var i = 0; i < quantity; i++) {
                state.tokens.push({
                    id: Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2),
                    name: name,
                    pow: power,
                    tou: toughness,
                    color: colorInput.value,
                    counters: 0,
                    tapped: false,
                    artUrl: '',
                    rules: '',
                    isArtifact: false,
                    isArtifactCreature: false
                });
            }

            nameInput.value = '';
            powInput.value = '1';
            touInput.value = '1';
            qtyInput.value = '1';
            colorInput.value = 'M';

            saveToStorage();
            render();
        });
}

// ============================================================
// TOKEN COUNTERS
// ============================================================

function adjustCounters(id, amount) {
    var token = state.tokens.find(function(token) {
        return token.id === id;
    });

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
    var token = state.tokens.find(function(token) {
        return token.id === id;
    });

    if (!token) {
        return;
    }

    token.tapped = !token.tapped;

    saveToStorage();
    render();
}

// ============================================================
// DELETE TOKEN
// ============================================================

function deleteToken(id) {
    state.tokens = state.tokens.filter(function(token) {
        return token.id !== id;
    });

    saveToStorage();
    render();
}

// ============================================================
// HTML ESCAPING
// ============================================================

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// DISPLAY P/T
// ============================================================

function getDisplayedStat(baseValue, counters) {
    var value = String(baseValue || '');

    if (/^-?\d+$/.test(value)) {
        return Number(value) + counters;
    }

    return value;
}

// ============================================================
// SHOULD SHOW P/T
// ============================================================

function shouldShowPT(token) {
    // Show P/T if:
    // 1. It's NOT an artifact, OR
    // 2. It IS an artifact creature
    // Hide P/T if it's a non-creature artifact
    return !token.isArtifact || token.isArtifactCreature;
}

// ============================================================
// RENDER
// ============================================================

function render() {
    var lifeDisplay = document.getElementById('life-display');
    var grid = document.getElementById('token-grid');

    if (lifeDisplay) {
        lifeDisplay.textContent = state.lifeTotal;
    }

    if (!grid) {
        return;
    }

    grid.innerHTML = '';

    state.tokens.forEach(function(token) {
        var card = document.createElement('div');

        var tappedClass = token.tapped ? 'tapped' : '';

        if (token.artUrl) {
            card.className = 'token-card has-art ' + tappedClass;
            card.style.backgroundImage = 'url(' + JSON.stringify(token.artUrl) + ')';
        } else {
            card.className = 'token-card clr-' + token.color + ' ' + tappedClass;
            card.style.backgroundImage = 'none';
        }

        var ptDisplay = '';

        // Only show P/T if it's a creature or non-artifact
        if (shouldShowPT(token)) {
            var power = getDisplayedStat(token.pow, token.counters);
            var toughness = getDisplayedStat(token.tou, token.counters);

            if (power !== '' && toughness !== '') {
                ptDisplay = '<div class="token-pt">' + escapeHtml(power) + '/' + escapeHtml(toughness) + '</div>';
            }
        }

        // Add a small indicator for non-creature artifacts
        var artifactBadge = '';
        if (token.isArtifact && !token.isArtifactCreature) {
            artifactBadge = '<div style="font-size:0.7rem;color:#888;margin-bottom:4px;">⚙️ Artifact</div>';
        }

        card.innerHTML = 
            '<div class="token-header">' +
                '<span class="token-title">' + escapeHtml(token.name) + '</span>' +
                '<button type="button" class="btn-delete" data-action="delete" data-id="' + escapeHtml(token.id) + '" aria-label="Delete token">' +
                    '✕' +
                '</button>' +
            '</div>' +
            ptDisplay +
            artifactBadge +
            '<div class="token-rules">' + escapeHtml(token.rules || '') + '</div>' +
            '<div class="counter-badge">' + token.counters + ' Counters</div>' +
            '<div class="token-controls">' +
                '<button type="button" class="btn-sm" data-action="counter-down" data-id="' + escapeHtml(token.id) + '">-1</button>' +
                '<button type="button" class="btn-sm" data-action="counter-up" data-id="' + escapeHtml(token.id) + '">+1</button>' +
            '</div>' +
            '<button type="button" class="btn-tap" data-action="tap" data-id="' + escapeHtml(token.id) + '">' +
                (token.tapped ? 'UNTAP' : 'TAP') +
            '</button>';

        grid.appendChild(card);
    });
}

// ============================================================
// TOKEN BUTTON EVENTS
// ============================================================

function handleTokenGridClick(event) {
    var button = event.target.closest('button[data-action]');

    if (!button) {
        return;
    }

    var action = button.dataset.action;
    var id = button.dataset.id;

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
    var input = document.getElementById('token-name');
    var box = document.getElementById('autocomplete-box');

    if (!input || !box) {
        return;
    }

    if (event.target === input || box.contains(event.target)) {
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

    var box = document.getElementById('autocomplete-box');

    if (box) {
        box.innerHTML = '';
    }
}

// ============================================================
// INITIALIZATION
// ============================================================

function initializeApp() {
    var grid = document.getElementById('token-grid');
    var nameInput = document.getElementById('token-name');

    if (grid) {
        grid.addEventListener('click', handleTokenGridClick);
    }

    if (nameInput) {
        nameInput.addEventListener('keydown', handleNameKeydown);
    }

    document.addEventListener('click', handleDocumentClick);

    render();
}

// ============================================================
// START APP
// ============================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}