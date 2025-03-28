// $[VAR] = lazy/callable property
// [VAR]$ = component/id reference

// CONSTANTS
const cardFile = './cards.json';
const resolveCardArt = (name) => `https://cdn.shardsofbeyond.com/rashid-test/${name.toLowerCase().replaceAll(/\W/g, '')}.png`;

// HELPER FUNCTIONS
const componentMap = new Map();

let counter = 0;
const identify = (obj, types, name) => {
    console.debug(`Registering component of types "${types}" with ID ${counter}...`);
    obj.id = counter;
    obj.types = types;
    obj.name = name;
    obj.toString = () => name;
    componentMap.set(counter, obj);

    counter++;
    
    return obj;
};

const createPlayerDefaultSettings = (name) => {
    const createOwnedContainer = (id) => {
        const container = [];
        container.owner$ = id;

        console.error(`CONTAINER`, container);
        return container;
    };

    let player = identify({}, ['player'], name);
    player = {...player,
        deck$: identify(createOwnedContainer(player.id), ['deck'], `${name}'s Deck`),
        hand$: identify(createOwnedContainer(player.id), ['hand'], `${name}'s Hand`),
        crystalZone: identify({
            cards: [],
            realmCounts: {
                Divine: 0,
                Elemental: 0,
                Mortal: 0,
                Nature: 0,
                Void: 0
            },
            total: 0,
            owner$: player.id
        }, ['crystalzone'], `${name}'s Crystal Zone`)
    };
    componentMap.set(player.id, player);

    return player;
};

// Create a new log entry.
const log = (text, fancy = false) => {
    const log = document.getElementById('log');

    const entry = document.createElement('div');
    entry.classList.add('log-entry');
    if(fancy) {
        entry.classList.add('log-entry-fancy');
    }
    entry.innerHTML = text;

    log.firstElementChild.insertAdjacentHTML("beforebegin", entry.outerHTML);
};

// Do an entire tick of the game state - update the view, actions, ...
const tick = () => {
    console.log('...tack', state);

    // Render state.
    render(state);

    // Calculate action space for both players.
    state.actions = [
        // If an action like that is "found", update the UI for it, too.
        {actor: 32, type: 'draw', args: [null, 30]},
        {actor: 66, type: 'summon', args: [32, 66, 15]},
        {actor: 66, type: 'summon', args: [32, 66, 16]},
        {actor: 66, type: 'summon', args: [32, 66, 17]},
        {actor: 66, type: 'summon', args: [32, 66, 18]},
        {actor: 66, type: 'summon', args: [32, 66, 19]},
        {actor: 66, type: 'crystallize', args: [32, 66, 32]}
    ];

    console.info('Current action space:', state.actions);
};

const preview = document.getElementById('card-preview');

const showCardPreview = (imageUrl) => {
    preview.style.backgroundImage = imageUrl;
    preview.style.display = 'block';
};

const hideCardPreview = () => {
    preview.style.display = 'none';
};

// TODO: AI should simply do a random action from its action space, whenever feasible.
// TODO: This should be an Object with Type -> Args, but for now we only accept single types.
let handleContextArguments = null;
const handleInteraction = (id) => {
    const component = componentMap.get(id);
    log(`${state.currentPlayer} interacted with ${component} (#${id})`, true);

    // We check whether this interaction has finalized a choice of previous action suggestions.
    if(handleContextArguments != null) {
        if(handleContextArguments.resolving.includes(id)) {
            console.info('Finalized choice!');

            const parameters = handleContextArguments.choices
                .map(p => {
                    if(!Array.isArray(p)) {
                        return p;
                    }

                    if(p.includes(id)) {
                        return id;
                    }

                    console.error(`WTF?? Context Choice was ${id}, but couldn't resolve! Context:`, handleContextArguments);
                    throw new Error('????');
                });

            actions[handleContextArguments.type](...parameters);
            handleContextArguments = null;
            return;
        } else {
            // Reset context and disable highlight!
            handleContextArguments = null;
            document.querySelectorAll('.highlight').forEach(e => e.classList.remove('highlight'));
        }
    }

    console.debug('Before filtering actions:', component.types, state.actions);
    const possibleActions = state.actions
        // filter out actions that are not accessible through this interaction.
        .filter(action => {
            console.debug('Action debug: ', RAW_ACTION_DICTIONARY[action.type]);
            return component.types.includes(RAW_ACTION_DICTIONARY[action.type].target);
        })
        // filter out actions where the current component is not part of its targets.
        .filter(action => {
            console.debug('Action debug #2: ', id, action.args);
            return action.args.includes(id);
        });
        // TODO: Filter only one's own actions (player)!

    console.debug('After filtering actions:', possibleActions);

    if(possibleActions.length == 1) {
        const action = possibleActions[0];

        // Reset handle context.
        handleContextArguments = null;
        // Execute chosen action.
        actions[action.type](...action.args);
    } else {
        if(possibleActions.length == 0) {
            console.warn(`No actions for ${id} available!`);
        } else {
            console.debug('Possible actions for selected Component:', possibleActions);

            const possibleActionTypes = [...new Set(possibleActions.map(action => action.type))];
            console.info('Possible action types:', possibleActionTypes);

            if(possibleActionTypes > 1) {
                logger.error(`Not implemented selecting different action types!`);
                return;
            }

            const targetAction = possibleActionTypes[0];

            // TODO: Filter out for different action types.
            // TODO: SAVE CONSTANT VALUES IN CONTEXT.
            // Find "spread" of components to calculate the possible selection from.
            const context = possibleActions
                .map(action => action.args)
                .reduce((prev, current) => {
                    if(prev.length === 0) {
                        return current.map(v => [v]);
                    }

                    return prev.map((v, i) => [...v, current[i]]);
                } ,[])
                // If there is no "real" choice for a certain parameter, that is good!
                // Otherwise we map all choices into an array.
                .map(choice => {
                    if(new Set(choice).size === 1) {
                        return choice[0];
                    }

                    return choice;
                });

            const choices = context
                .filter(parameter => Array.isArray(parameter))
                .flat();
            // Update all "chooseable" elements in the UI.
            choices
                .forEach(id => {
                    const element = document.getElementById(id);
                    element.classList.add('highlight');
                });
            handleContextArguments = {type: targetAction, choices: context, resolving: choices};
        }
    }
};

const initializeLane = ($slots) => (() => {
    const lane = {
        orientation: 'horizontal',
        $slots: $slots,
        $power: state.players.map(player => {
            return {
                player$: player.id,
                power: $slots()
                    .map(slot => slot.card)
                    .filter(card => card !== undefined)
                    .filter(card => card.owner$ == player.id)
                    .reduce((prev, curr) => prev + curr.Power, 0)
            };
        })
    };

    return lane;
});

// TODO: Make either idempotent or only render diff!
const render = (model) => {
    // Cards on Board.
    model.board.slots.forEach(slot => {
        // TODO: Only render when element doesn't yet exist.
        let slotElement = document.getElementById(slot.id);

        const renderCardArtFunction = () => slot.card === undefined ? null : `url('${resolveCardArt(slot.card.Name)}')`;
        if(slotElement == null) {
            slotElement = document.createElement('div');
            slotElement.classList.add('slot');
            slotElement.id = slot.id;

            slotElement.addEventListener('click', () => handleInteraction(slot.id));
            slotElement.addEventListener('mouseover', renderCardArtFunction);
    
            document.getElementById('game-board').appendChild(slotElement);
        }

        console.log(slot.card);
        slotElement.style.backgroundImage = renderCardArtFunction();
    });

    // Deck.
    model.players.forEach((player, i) => {
        const deckId = player.deck$.id;
        // TODO: Only render when element doesn't yet exist.
        if(document.getElementById(deckId) != null) {
            return;
        }

        const deckElement = document.createElement('div');
        deckElement.classList.add(`deck-player${i + 1}`);
        deckElement.id = deckId;

        deckElement.addEventListener('click', () => handleInteraction(deckId));
    });

    // Lanes.
    model.board.lanes.forEach((lane, i) => {
        // Render single Lane.
        let laneElement = document.getElementById(lane.id);
        if(laneElement == null) {
            const cssClass = `lane lane-${i} lane-${lane.orientation}`;

            laneElement = document.createElement('div');
            laneElement.classList.add(...cssClass.split(' '));
            laneElement.id = lane.id;
            laneElement.addEventListener('click', () => handleInteraction(lane.id));
        }

        // Render Power indicator for this lane.
        const powerIndicatorId = `power-indicator-${i}`;

        let powerIndicator = document.getElementById(powerIndicatorId);
        if(powerIndicator == null) {
            powerIndicator = document.createElement('div');
            
            powerIndicator.classList.add('power-indicator');
            powerIndicator.id = powerIndicatorId;
            laneElement.appendChild(powerIndicator);

            const board = document.getElementById('game-board');
            board.appendChild(laneElement);
        }
        // Always update Power per Player per Lane!
        const powerPlayerEntries = lane.$properties().$power;
        const powerDisparity = powerPlayerEntries[0].power - powerPlayerEntries[1].power;
        powerIndicator.innerHTML = `<span class="neutral${powerDisparity == 0 ? '' : powerDisparity > 0 ? `player1` : 'player2'}">${powerDisparity}</span>`;

    });

    // Crystal Zones.
    model.players.forEach((player, i) => {
        // Render Crystal Zones
        const crystalZoneId = player.crystalZone.id;

        if(document.getElementById(crystalZoneId) != null) {
            return;
        }

        const crystalZoneElement = document.createElement('div');
        crystalZoneElement.id = crystalZoneId;
        crystalZoneElement.classList.add('crystalzone', `player${i + 1}-crystalzone`);
        crystalZoneElement.addEventListener('click', () => handleInteraction(crystalZoneId));

        const playerArea = document.getElementById(`player${i + 1}-area`);
        playerArea.appendChild(crystalZoneElement);
    });

    // Hand.
    model.players.forEach((player, i) => {
        const handId = player.hand$.id;

        if(document.getElementById(handId) != null) {
            return;
        }

        const handElement = document.createElement('div');
        handElement.id = handId;
        handElement.classList.add('hand', `player${i + 1}-hand`);

        const playerArea = document.getElementById(`player${i + 1}-area`);
        playerArea.appendChild(handElement);
    });
    
    // Cards in Hand.
    model.players.forEach(player => {
        const handElement = document.getElementById(player.hand$.id);

        // Remove no longer referenced nodes in the DOM, if the model doesn't hold the card anymore.
        const handCardElementsToRemove = [
                ...document.getElementById(player.hand$.id)
                .childNodes
                .values()
            ]
            .filter(node => !player.hand$.includes(+node.id));
        console.log(handCardElementsToRemove, player.hand$);

        player.hand$.forEach(cardId => {
            const card = componentMap.get(cardId);
            const imageUrl = `url('${resolveCardArt(card.Name)}')`;

            // TODO: Only render when element doesn't yet exist.
            let cardElement = document.getElementById(cardId);
            if(cardElement == null) {
                cardElement = document.createElement('div');
                cardElement.classList.add('card');
                cardElement.id = cardId;

                cardElement.addEventListener('mouseover', () => showCardPreview(imageUrl));
                cardElement.addEventListener('click', () => handleInteraction(cardId));
                
                handElement.appendChild(cardElement);
            }

            cardElement.style.backgroundImage = imageUrl;
        });
    });

    model.players.forEach((player, i) => {       
        const deckArea = document.getElementById(`deck-area-player${i + 1}`)

        const deckId = player.deck$.id;
        if(document.getElementById(deckId) == null) {
            const deckElement = document.createElement('div');
            deckElement.classList.add('deck');
            deckElement.id = deckId;
            deckElement.addEventListener('click', () => handleInteraction(deckId));

            deckArea.appendChild(deckElement);
        }

        // Deck Count - render once, update always.
        const deckCounterId = `counter-player${i + 1}`;
        let deckCounterElement = document.getElementById(deckCounterId);
        if(deckCounterElement == null) {
            deckCounterElement = document.createElement('div');
            deckCounterElement.classList.add('deck-count');
            deckCounterElement.id = deckCounterId;

            deckArea.appendChild(deckCounterElement);
        }
        // Always update this value!
        deckCounterElement.textContent = player.deck$.length;
    });

};

// MODEL.
let state = {
    wonBy: undefined,
    currentPlayer: 0,
    board: {
        slots: Array(5).fill().map((_, x) => Array(4).fill().map((_, y) => {
            const slot = {
                card: undefined,
                x: x,
                y: y
            };

            return identify(slot, ['slot'], `Slot ${x + 1}/${y + 1}`);
        })).flat(),
        lanes: [
            // 4 Horizontal Lanes
            ...Array(4).fill().map((_, i) => {
                // Each Lane definition
                const $slots = () => state.board.slots.filter(slot => slot.y === i);
                const lane = {$properties: initializeLane($slots), orientation: 'horizontal'};

                return identify(lane, ['lane', 'horizontal-lane'], `Horizontal Lane ${i + 1}`);
            }),
            // 5 Vertical Lanes
            ...Array(5).fill().map((_, i) => {
                // Each Lane definition
                const $slots = () => state.board.slots.filter(slot => slot.x === i);
                const lane = {$properties: initializeLane($slots), orientation: 'vertical'};

                return identify(lane, ['lane', 'vertical-lane'], `Vertical Lane ${i + 1}`);
            })
        ]
    },
    players: [
        createPlayerDefaultSettings('Shrenrin'),
        createPlayerDefaultSettings('Drassi')
    ],
    actions: []
};

console.error('STATE', state);

// ACTION DICTIONARY
const RAW_ACTION_DICTIONARY = {
    draw: {
        execute: (player = null, deck) => {
            // Default to Player's Deck.
            if(player == null) {
                player = componentMap.get(deck.owner$);
            }

            console.error(`DRAW`, player, deck);
            const card = deck.pop();
            player.hand$.push(card.id);
            card.location$ = player.hand$.id;
            
            return [player, deck];
        },
        log: (player, deck) => `Player ${player} drew a card from ${deck}.`,
        target: 'deck'
    },
    summon: {
        execute: (player, card, slot) => {
            slot.card = card; // Move card to slot.

            // Remove card from previous location.
            const previousLocation = componentMap.get(card.location$);

            let newReference;
            console.info(`Removing ${card} from ${previousLocation}`);
            if(Array.isArray(previousLocation)) {
                newReference = previousLocation.filter(c => c.id != card.id);
            } else {
                newReference = undefined;
            }
            // Modify the existing container by rewriting the reference.
            componentMap.set(card.location$, newReference);
            
            card.location$ = slot.id; // Reference card to slot.

            return [player, card, slot];
        },
        log: (player, card, slot) => `Player ${player} summoned a ${card} into Slot ${slot}.`,
        target: 'card'
    },
    crystallize: {
        execute: (player, card) => {

            // Remove card from previous location.
            const previousLocation = componentMap.get(card.location$);

            let newReference;
            if(Array.isArray(previousLocation)) {
                newReference = previousLocation.filter(c => c.id != card.id);
            } else {
                newReference = undefined;
            }
            // Modify the existing container by rewriting the reference.
            componentMap.set(card.location$, newReference);
            
            card.location$ = player.crystalzone.id;

            return [player, card];
        },
        log: (player, card) => `Player ${player} crystallized ${card}.`,
        target: 'card'
    },
};
const actions = new Proxy(RAW_ACTION_DICTIONARY, {
    get: (target, prop, _receiver) => {
        console.info(target, prop);
        const response = target[prop];

        // Automatically execute logging on action execution.
        return new Proxy(response.execute, {
            apply: (target, thisArg, argArray) => {

                // References inside the arguments need to be translated to real components!
                console.debug(`Executing action ${prop} with components ${argArray}`);
                const mappedArray = argArray.map(arg => {
                    if(typeof arg != "number") {
                        return arg;
                    }

                    return componentMap.get(arg);
                });

                const usedParameters = target.apply(thisArg, mappedArray);

                log(response.log(...usedParameters));
                tick();
            }
        });
    }
});

// SCRIPT
document.addEventListener('DOMContentLoaded', async () => {
    const request = await fetch(cardFile);
    const cards = (await request.json())
        .filter(card => card.Set == 1) // Only valid cards from Set 1 should be made into decks.
        .filter(card => card.Cardtype === 'Unit')
        // FIXME: Remove!
        .map(card => {
            return {
                ...card,
                Name: 'Ambrosia Bee'
            }
        }); // Only play with Units.

    log(`Loaded a total of ${cards.length} cards!`, true);

    // Fill each Players deck with 30 random cards.
    state.players.forEach(player => {
        Array(30).fill().forEach(() => {
            const randomCard = cards[Math.floor(Math.random() * cards.length)];

            // Add ownership to cards.
            player.deck$.push(identify({...randomCard, owner$: player.id, location$: player.deck$.id}, ['card'], randomCard.Name).id);
        });
    });

    // Randomize starting player.
    state.currentPlayer = state.players[0];

    // Each Player draws 5 cards from their Deck.
    state.players.forEach(player => {
        Array(5).fill().forEach(() => {
            console.log(player);
            actions.draw(null, player.deck$);
        });
    });

    console.log('State after initialization:', state);
});