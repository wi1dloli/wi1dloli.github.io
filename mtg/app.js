// ============================================================
// WI1DTRACK - MTG GAME TRACKER
// iOS 9.3.5 Compatible - IMG TAG APPROACH
// ============================================================

var STORAGE_KEY = 'mtg_state';
var SCRYFALL_API = 'https://api.scryfall.com';

// ============================================================
// POLYFILLS FOR iOS 9.3.5
// ============================================================

if (!Array.isArray) {
    Array.isArray = function(arg) {
        return Object.prototype.toString.call(arg) === '[object Array]';
    };
}

if (!Array.prototype.find) {
    Array.prototype.find = function(predicate) {
        if (this === null) {
            throw new TypeError('Array.prototype.find called on null or undefined');
        }
        if (typeof predicate !== 'function') {
            throw new TypeError('predicate must be function');
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

if (!Array.prototype.filter) {
    Array.prototype.filter = function(fun) {
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

    if (Array.isArray(card.card_faces)) {
        return false;
    }

    return true;
}

function isArtifactToken(card) {
    if (!card) {
        return false;
    }

    var typeLine = card.type_line || '';
    return /\bArtifact\b/i.test(typeLine);
}

function isArtifactCreatureToken(card) {
    if (!card) {
        return false;
    }

    var typeLine = card.type_line || '';
    return /\bArtifact\b/i.test(typeLine) && /\bCreature\b/i.test(typeLine);
}

// ============================================================
// IMAGE HANDLING
// ============================================================

function getCardImage(card) {
    if (!card) {
        return '';
    }

    // Try PNG first (better for iOS 9)
    if (card.image_uris && card.image_uris.png) {
        return card.image_uris.png;
    }
    
    if (card.image_uris && card.image_uris.normal) {
        return card.image_uris.normal;
    }
    
    if (card.image_uris && card.image_uris.small) {
        return card.image_uris.small;
    }
    
    if (card.image_uris && card.image_uris.art_crop) {
        return card.image_uris.art_crop;
    }

    return '';
}

// ============================================================
// SCRYFALL AUTOCOMPLETE
// ============================================================

var autocompleteTimer = null;
var autocompleteRequest = 0;
var cachedTokenResults = [];

function handleNameInput(query) {
    var box = document.getElementById('autocomplete-box');

    if (!box) {
        return;
    }

    clearTimeout(autocompleteTimer);

    query = query.trim();

    if (query.length < 2) {
        box.innerHTML = '';
        cachedTokenResults = [];
        return;
    }

    autocompleteTimer = setTimeout(function() {
        var requestNumber = ++autocompleteRequest;

        try {
            var searchQuery = 't:token name:' + query + '*';
            var url = SCRYFALL_API + '/cards/search?q=' + encodeURIComponent(searchQuery) + '&unique=cards';

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
                        cachedTokenResults = [];
                        return;
                    }

                    cachedTokenResults = data.data.filter(function(card) {
                        return isSingleFacedToken(card);
                    });

                    if (cachedTokenResults.length === 0) {
                        box.innerHTML = '<div class="suggestion-item" style="color:#888;cursor:default;">No tokens found</div>';
                        return;
                    }

                    var groupedTokens = {};
                    cachedTokenResults.forEach(function(card) {
                        var name = card.name;
                        if (!groupedTokens[name]) {
                            groupedTokens[name] = [];
                        }
                        groupedTokens[name].push(card);
                    });

                    var names = Object.keys(groupedTokens);
                    names.forEach(function(name) {
                        var cards = groupedTokens[name];
                        
                        if (cards.length === 1) {
                            var card = cards[0];
                            var suggestion = document.createElement('div');
                            suggestion.className = 'suggestion-item';
                            suggestion.innerHTML = formatSuggestionHTML(card);
                            suggestion.addEventListener('click', function() {
                                selectToken(card);
                            });
                            box.appendChild(suggestion);
                        } else {
                            cards.forEach(function(card) {
                                var suggestion = document.createElement('div');
                                suggestion.className = 'suggestion-item suggestion-variant';
                                suggestion.innerHTML = formatSuggestionHTML(card);
                                suggestion.addEventListener('click', function() {
                                    selectToken(card);
                                });
                                box.appendChild(suggestion);
                            });
                        }
                    });

                })
                .catch(function(error) {
                    console.error('Token autocomplete error:', error);
                    if (requestNumber === autocompleteRequest) {
                        box.innerHTML = '<div class="suggestion-item" style="color:#888;cursor:default;">Error loading tokens</div>';
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

function formatSuggestionHTML(card) {
    var name = card.name || '';
    var typeLine = card.type_line || '';
    var power = card.power || '';
    var toughness = card.toughness || '';
    var oracleText = card.oracle_text || '';
    var manaCost = card.mana_cost || '';
    
    var html = '';
    
    html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    html += '<span style="font-weight:bold;font-size:1.05rem;">' + name + '</span>';
    if (manaCost) {
        html += '<span style="color:#f59e0b;font-size:0.8rem;">' + manaCost + '</span>';
    }
    html += '</div>';
    
    var typeDisplay = typeLine.replace(/Token/g, '').trim();
    if (typeDisplay) {
        var typeColor = '#888';
        if (typeDisplay.indexOf('Creature') !== -1) typeColor = '#4CAF50';
        if (typeDisplay.indexOf('Artifact') !== -1) typeColor = '#FF9800';
        if (typeDisplay.indexOf('Enchantment') !== -1) typeColor = '#9C27B0';
        if (typeDisplay.indexOf('Land') !== -1) typeColor = '#795548';
        if (typeDisplay.indexOf('Instant') !== -1 || typeDisplay.indexOf('Sorcery') !== -1) typeColor = '#F44336';
        
        html += '<div style="color:' + typeColor + ';font-size:0.8rem;margin:2px 0;">' + typeDisplay + '</div>';
    }
    
    if (power && toughness) {
        html += '<div style="color:#f59e0b;font-weight:bold;font-size:1.2rem;margin:2px 0;">' + power + '/' + toughness + '</div>';
    }
    
    if (oracleText) {
        var keywords = extractKeywords(oracleText);
        
        if (keywords.length > 0) {
            html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin:3px 0;">';
            keywords.forEach(function(keyword) {
                html += '<span style="background:#2a2a2a;color:#4FC3F7;padding:1px 6px;border-radius:3px;font-size:0.65rem;border:1px solid #333;">' + keyword + '</span>';
            });
            html += '</div>';
        }
        
        var previewText = oracleText;
        if (previewText.length > 60) {
            previewText = previewText.substring(0, 60) + '...';
        }
        html += '<div style="color:#aaa;font-size:0.7rem;font-style:italic;margin:2px 0;line-height:1.2;">' + previewText + '</div>';
    }
    
    if (isArtifactToken(card)) {
        var isCreature = card.type_line && card.type_line.indexOf('Creature') !== -1;
        var icon = isCreature ? '⚙️ Artifact Creature' : '⚙️ Artifact';
        html += '<div style="color:#FF9800;font-size:0.65rem;margin-top:2px;">' + icon + '</div>';
    }
    
    return html;
}

function extractKeywords(text) {
    if (!text) return [];
    
    var keywordList = [
        'Flying', 'First Strike', 'Double Strike', 'Deathtouch', 
        'Haste', 'Hexproof', 'Indestructible', 'Lifelink', 
        'Menace', 'Reach', 'Trample', 'Vigilance', 
        'Defender', 'Flash', 'Ward', 'Protection',
        'Skulk', 'Prowess', 'Enchant', 'Equip',
        'Crew', 'Surveil', 'Dredge',
        'Escape', 'Companion', 'Mutate', 'Partner',
        'Undying', 'Persist', 'Unleash', 'Evolve'
    ];
    
    var found = [];
    
    keywordList.forEach(function(keyword) {
        var regex = new RegExp('\\b' + keyword + '\\b', 'i');
        if (regex.test(text) && found.indexOf(keyword) === -1) {
            found.push(keyword);
        }
    });
    
    if (/\bwhenever\b/i.test(text)) {
        found.push('Trigger');
    }
    if (/at the beginning/i.test(text)) {
        found.push('Trigger');
    }
    if (/\bcreatures you control\b/i.test(text)) {
        found.push('Anthem');
    }
    if (/\bsacrifice\b/i.test(text)) {
        found.push('Sacrifice');
    }
    if (/\btap\b/i.test(text) && !/\buntap\b/i.test(text)) {
        found.push('Tap');
    }
    
    return found.slice(0, 6);
}

function selectToken(card) {
    var input = document.getElementById('token-name');
    var box = document.getElementById('autocomplete-box');
    var powInput = document.getElementById('token-pow');
    var touInput = document.getElementById('token-tou');

    if (input) {
        input.value = card.name;
    }

    if (card.power && card.toughness) {
        if (powInput) {
            powInput.value = card.power;
        }
        if (touInput) {
            touInput.value = card.toughness;
        }
    } else {
        if (powInput) {
            powInput.value = '';
        }
        if (touInput) {
            touInput.value = '';
        }
    }

    window._selectedTokenCard = card;

    if (box) {
        box.innerHTML = '';
    }
    
    var form = document.getElementById('token-form');
    if (form) {
        form.dispatchEvent(new Event('submit'));
    }
}

function findToken(tokenName) {
    var name = tokenName.trim();

    if (!name) {
        return Promise.resolve(null);
    }

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

function getCardRules(card) {
    if (!card) {
        return '';
    }

    return card.oracle_text || '';
}

function getCardPower(card) {
    if (!card) {
        return null;
    }

    if (card.power !== undefined && card.power !== null) {
        return card.power;
    }

    return null;
}

function getCardToughness(card) {
    if (!card) {
        return null;
    }

    if (card.toughness !== undefined && card.toughness !== null) {
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

    var selectedCard = window._selectedTokenCard || null;
    
    if (selectedCard && selectedCard.name === name) {
        createTokensFromCard(selectedCard, name, quantity, colorInput, powInput, touInput);
    } else {
        findToken(name)
            .then(function(card) {
                createTokensFromCard(card, name, quantity, colorInput, powInput, touInput);
            })
            .catch(function(error) {
                console.error('Scryfall token lookup failed:', error);
                createTokensFromCard(null, name, quantity, colorInput, powInput, touInput);
            });
    }
}

function createTokensFromCard(card, name, quantity, colorInput, powInput, touInput) {
    var imageUrl = '';
    var rulesText = '';
    var power = powInput.value.trim() || '1';
    var toughness = touInput.value.trim() || '1';
    var isArtifact = false;
    var isArtifactCreature = false;

    if (card) {
        imageUrl = getCardImage(card);
        rulesText = getCardRules(card);
        isArtifact = isArtifactToken(card);
        isArtifactCreature = isArtifactCreatureToken(card);

        if (!isArtifact || isArtifactCreature) {
            var scryfallPower = getCardPower(card);
            var scryfallToughness = getCardToughness(card);

            if (scryfallPower !== null && scryfallPower !== undefined) {
                power = String(scryfallPower);
                if (powInput) powInput.value = power;
            }

            if (scryfallToughness !== null && scryfallToughness !== undefined) {
                toughness = String(scryfallToughness);
                if (touInput) touInput.value = toughness;
            }
        } else {
            power = '';
            toughness = '';
            if (powInput) powInput.value = '';
            if (touInput) touInput.value = '';
        }
    }

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

    var nameInput = document.getElementById('token-name');
    if (nameInput) nameInput.value = '';
    if (powInput) powInput.value = '1';
    if (touInput) touInput.value = '1';
    if (document.getElementById('token-qty-input')) document.getElementById('token-qty-input').value = '1';
    if (colorInput) colorInput.value = 'M';
    
    window._selectedTokenCard = null;

    saveToStorage();
    render();
}

// ============================================================
// TOKEN CONTROLS
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

function deleteToken(id) {
    state.tokens = state.tokens.filter(function(token) {
        return token.id !== id;
    });

    saveToStorage();
    render();
}

// ============================================================
// RENDER HELPERS
// ============================================================

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getDisplayedStat(baseValue, counters) {
    var value = String(baseValue || '');

    if (/^-?\d+$/.test(value)) {
        return Number(value) + counters;
    }

    return value;
}

function shouldShowPT(token) {
    return !token.isArtifact || token.isArtifactCreature;
}

// ============================================================
// RENDER - WITH FALLBACK FOR iOS 9
// ============================================================

// ============================================================
// RENDER - NO IMAGES, JUST STYLIZED TOKENS FOR iOS 9
// ============================================================

// ============================================================
// RENDER - HYBRID: Images on PC, Fallback on iOS 9
// ============================================================

// Detect iOS 9
function isIOS9() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) && /OS 9_/.test(ua);
}

// ============================================================
// RENDER - WITH MTG CARD FRAME STYLE FALLBACK
// ============================================================

// Detect iOS 9
function isIOS9() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) && /OS 9_/.test(ua);
}

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

    var iOS9 = isIOS9();

    state.tokens.forEach(function(token) {
        var wrapper = document.createElement('div');
        wrapper.className = 'token-wrapper';
        
        var card = document.createElement('div');

        var tappedClass = token.tapped ? 'tapped' : '';

        // Color map for fallback - MTG colors
        var colorMap = {
            'W': { bg: '#f5f0dc', text: '#000000', border: '#d4c9a8', accent: '#f5e6b8' },
            'U': { bg: '#0e4b7a', text: '#ffffff', border: '#0a3a5e', accent: '#1a6a9a' },
            'B': { bg: '#1a1a1a', text: '#ffffff', border: '#0d0d0d', accent: '#2a2a2a' },
            'R': { bg: '#8b1a1a', text: '#ffffff', border: '#6a1414', accent: '#aa2a2a' },
            'G': { bg: '#1a5a1a', text: '#ffffff', border: '#144a14', accent: '#2a7a2a' },
            'C': { bg: '#4a4a4a', text: '#ffffff', border: '#3a3a3a', accent: '#5a5a5a' },
            'M': { bg: '#2a1a4a', text: '#ffffff', border: '#1a0a3a', accent: '#4a2a6a' }
        };

        // If on iOS 9 OR no image URL, use fallback
        if (iOS9 || !token.artUrl) {
            var colors = colorMap[token.color] || colorMap['C'];
            var bgColor = colors.bg;
            var textColor = colors.text;
            var borderColor = colors.border;
            var accentColor = colors.accent;

            card.className = 'token-card fallback-card ' + tappedClass;
            card.style.backgroundColor = bgColor;
            card.style.borderColor = borderColor;
            card.style.borderWidth = '3px';
            card.style.borderStyle = 'solid';
            card.style.boxShadow = 'inset 0 0 30px rgba(0,0,0,0.3), 0 4px 15px rgba(0,0,0,0.5)';

            // Build P/T
            var ptDisplay = '';
            if (shouldShowPT(token)) {
                var power = getDisplayedStat(token.pow, token.counters);
                var toughness = getDisplayedStat(token.tou, token.counters);
                if (power !== '' && toughness !== '') {
                    ptDisplay = '<div class="token-pt" style="color:' + textColor + ';background:rgba(0,0,0,0.3);padding:2px 12px;border-radius:4px;display:inline-block;">' + escapeHtml(power) + '/' + escapeHtml(toughness) + '</div>';
                }
            }

            var artifactBadge = '';
            if (token.isArtifact && !token.isArtifactCreature) {
                artifactBadge = '<div class="artifact-badge" style="color:' + textColor + ';opacity:0.7;">⚙️ Artifact</div>';
            }

            // Token type line
            var typeLine = token.isArtifact ? 'Artifact Token' : 'Token Creature';
            if (token.isArtifact && token.isArtifactCreature) {
                typeLine = 'Artifact Creature Token';
            }

            card.innerHTML = 
                // Top bar with name and delete
                '<div class="token-header" style="border-bottom:2px solid ' + borderColor + ';padding-bottom:4px;">' +
                    '<span class="token-title" style="color:' + textColor + ';font-size:0.95rem;font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.5);">' + escapeHtml(token.name) + '</span>' +
                    '<button type="button" class="btn-delete" data-action="delete" data-id="' + escapeHtml(token.id) + '" style="color:#ff6b6b;font-size:1.2rem;background:none;border:none;cursor:pointer;">✕</button>' +
                '</div>' +
                // Center - Big mana symbol style letter
                '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:4px 0;">' +
                    '<div style="font-size:4.5rem;font-weight:bold;color:' + textColor + ';opacity:0.25;text-shadow:0 0 40px rgba(255,255,255,0.1);font-family:serif;">' + token.name.charAt(0).toUpperCase() + '</div>' +
                    '<div style="font-size:0.65rem;color:' + textColor + ';opacity:0.5;letter-spacing:1px;text-transform:uppercase;">' + typeLine + '</div>' +
                '</div>' +
                // Bottom section with P/T, counters, buttons
                '<div style="border-top:2px solid ' + borderColor + ';padding-top:4px;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;margin:2px 0;">' +
                        '<div style="flex:1;text-align:center;">' + ptDisplay + '</div>' +
                        '<div style="flex:1;text-align:center;">' + artifactBadge + '</div>' +
                    '</div>' +
                    '<div class="token-rules" style="color:' + textColor + ';opacity:0.7;font-size:0.6rem;font-style:italic;text-align:center;margin:2px 0;">' + escapeHtml(token.rules || '') + '</div>' +
                    '<div class="counter-badge" style="color:' + textColor + ';text-align:center;font-size:0.7rem;font-weight:bold;margin:2px 0;">' + token.counters + ' Counters</div>' +
                    '<div class="token-controls" style="display:flex;gap:4px;margin:2px 0;">' +
                        '<button type="button" class="btn-sm" data-action="counter-down" data-id="' + escapeHtml(token.id) + '" style="flex:1;padding:3px;font-size:0.7rem;background:rgba(255,255,255,0.15);border:1px solid ' + borderColor + ';border-radius:4px;color:' + textColor + ';cursor:pointer;">-1</button>' +
                        '<button type="button" class="btn-sm" data-action="counter-up" data-id="' + escapeHtml(token.id) + '" style="flex:1;padding:3px;font-size:0.7rem;background:rgba(255,255,255,0.15);border:1px solid ' + borderColor + ';border-radius:4px;color:' + textColor + ';cursor:pointer;">+1</button>' +
                    '</div>' +
                    '<button type="button" class="btn-tap" data-action="tap" data-id="' + escapeHtml(token.id) + '" style="width:100%;padding:4px;margin-top:2px;border:none;border-radius:4px;font-size:0.7rem;font-weight:bold;background:' + (token.tapped ? '#666' : '#f59e0b') + ';color:' + (token.tapped ? '#fff' : '#000') + ';cursor:pointer;">' +
                        (token.tapped ? 'UNTAP' : 'TAP') +
                    '</button>' +
                '</div>';

        } else {
            // --- IMAGE MODE (PC and modern devices) ---
            card.className = 'token-card has-art ' + tappedClass;
            card.style.backgroundImage = 'url(' + JSON.stringify(token.artUrl) + ')';
            card.style.backgroundColor = '#1a1a2e';
            card.style.padding = '10px 8px';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.justifyContent = 'space-between';

            var ptDisplay = '';
            if (shouldShowPT(token)) {
                var power = getDisplayedStat(token.pow, token.counters);
                var toughness = getDisplayedStat(token.tou, token.counters);
                if (power !== '' && toughness !== '') {
                    ptDisplay = '<div class="token-pt">' + escapeHtml(power) + '/' + escapeHtml(toughness) + '</div>';
                }
            }

            var artifactBadge = '';
            if (token.isArtifact && !token.isArtifactCreature) {
                artifactBadge = '<div class="artifact-badge">⚙️ Artifact</div>';
            }

            card.innerHTML = 
                '<div class="token-header">' +
                    '<span class="token-title">' + escapeHtml(token.name) + '</span>' +
                    '<button type="button" class="btn-delete" data-action="delete" data-id="' + escapeHtml(token.id) + '">✕</button>' +
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
        }

        wrapper.appendChild(card);
        grid.appendChild(wrapper);
    });
}

// ============================================================
// EVENT HANDLERS
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
    window._selectedTokenCard = null;
}

function handleNameKeydown(event) {
    if (event.key !== 'Escape') {
        return;
    }

    var box = document.getElementById('autocomplete-box');

    if (box) {
        box.innerHTML = '';
        window._selectedTokenCard = null;
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}