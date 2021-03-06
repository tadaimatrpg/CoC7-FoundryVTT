import { CoC7Check } from '../check.js';
import { chatHelper, CoC7Roll } from './helper.js';
import { CoC7Chat } from '../chat.js';

export class CoC7MeleeInitiator{
	constructor(actorKey = null, itemId = null, fastForward = false) {
		this.actorKey = actorKey;
		this.itemId = itemId;
		this.fastForward = fastForward;
		this.resolved = false;
		this.outnumbered = false;
		this.surprised = false;
		this.autoSuccess = false;
		this.advantage = false;
		this.disadvantage = false;
		this.messageId = null;
		this.targetCard = null;
		this.rolled = false;
	}


	get isBlind(){
		return 'blindroll' === this.rollMode;
	}

	get rollMode(){
		if( !this._rollMode) this._rollMode = game.settings.get('core', 'rollMode');
		return this._rollMode;
	}

	set rollMode(x){
		this._rollMode = x;
	}

	get actor(){
		return chatHelper.getActorFromKey( this.actorKey);
	}

	get token(){
		return chatHelper.getTokenFromKey( this.actorKey);
	}

	get item(){
		return this.actor.getOwnedItem( this.itemId);
	}

	get weapon(){
		return this.item;
	}

	get targets(){
		return [...game.user.targets];
	}

	get target(){
		if( !this._target){
			if( this._targetKey)
			{
				this._target = chatHelper.getTokenFromKey( this._targetKey);
			} else {
				this._target = this.targets.pop();
				if( this._target){
					this._targetKey = this._target? `${this._target.scene._id}.${this._target.id}`: null;
				}
				else this._target = null;
			}
		}
		return this._target;
	}

	get targetKey(){
		if( !this.target) return null;
		return this._targetKey;
	}

	set targetKey(x){
		this._targetKey = x;
	}

	get skills(){
		return this.actor.getWeaponSkills( this.itemId);
	}

	get targetImg(){
		if( this.target){
			if( this.target.actor.isToken) return this.target.data.img;
			return this.target.actor.img;
		}
		return '../icons/svg/mystery-man-black.svg';
	}

	template = 'systems/CoC7/templates/chat/combat/melee-initiator.html';

	async createChatCard(){
		const html = await renderTemplate(this.template, this);
		
		const speaker = ChatMessage.getSpeaker({token: this.token});
		// if( this.actor.isToken) speaker.alias = this.actor.token.name;
		
		const user = this.actor.user ? this.actor.user : game.user;

		const chatData = {
			user: user._id,
			speaker,
			content: html
		};

		// Add image to card.
		// data.flags = {
		// 	img: this.actor.isToken ? this.actor.token.data.img: this.actor.img
		// };

		if ( ['gmroll', 'blindroll'].includes(this.rollMode) ) chatData['whisper'] = ChatMessage.getWhisperRecipients('GM');
		if ( this.isBlind ) chatData['blind'] = true;

		const chatMessage = await ChatMessage.create(chatData);
		
		return chatMessage;
	}

	async updateChatCard(){
		let html = await renderTemplate(this.template, this);

		const message = game.messages.get( this.messageId);

		const msg = await message.update({ content: html });
		await ui.chat.updateMessage( msg, false);
		return msg;
	}

	toggleFlag( flagName){
		const flag = flagName.includes('-') ? chatHelper.hyphenToCamelCase( flagName) : flagName;
		this[flag] = !this[flag];
	}


	async performSkillCheck( skillId = null, publish = false){
		const check = new CoC7Check();
		check.referenceMessageId = this.messageId;
		check.rollType= 'opposed';
		check.side = 'initiator';
		check.action = 'attack';
		check.actor = this.actorKey;
		check.item = this.itemId;
		check.skill = skillId;
		check.difficulty = CoC7Check.difficultyLevel.regular;
		check.diceModifier = 0;

		if( this.outnumbered) check.diceModifier += 1;
		if( this.surprised) check.diceModifier += 1;
		if( this.disadvantage) check.diceModifier -= 1;
		if( this.advantage) check.diceModifier += 1;

		check.roll();
		this.check = check;
		this.rolled = true;
		this.resolved = true;
		if( publish) check.toMessage();

		if( this.target && !this.autoSuccess){
			const target = new CoC7MeleeTarget( this.targetKey, this.messageId, this.fastForward);
			target.initiatorKey = this.actorKey;
			const message = await target.createChatCard();
			this.targetCard = message.id;
		}

		if( this.autoSuccess && !this.check.isFumble){
			this.check.forcePass();
		}
		return check;
	}

	async publishCheckResult( check = null){
		if( !check && !this.check) return null;

		if( check) this.check = check;
		this.roll = CoC7Roll.getFromCheck( this.check);
		this.rolled = true;

		this.roll.rollIcons = [];
		if( this.roll.critical){
			this.roll.rollColor = 'goldenrod';
			this.roll.rollTitle = game.i18n.localize('CoC7.CriticalSuccess');
			for( let index = 0; index < 4; index++){
				this.roll.rollIcons.push( 'medal');
			}
		} else if(  this.roll.fumble) {
			this.roll.rollColor = 'darkred';
			this.roll.rollTitle = game.i18n.localize('CoC7.Fumble');
			for( let index = 0; index < 4; index++){
				this.roll.rollIcons.push( 'spider');
			}
		}else if(  this.roll.success){
			this.roll.rollColor = 'goldenrod';
			if( CoC7Check.successLevel.regular ==  this.roll.successLevel )  this.roll.rollTitle = game.i18n.localize('CoC7.RegularSuccess');
			if( CoC7Check.successLevel.hard ==  this.roll.successLevel )  this.roll.rollTitle = game.i18n.localize('CoC7.HardSuccess');
			if( CoC7Check.successLevel.extreme ==  this.roll.successLevel )  this.roll.rollTitle = game.i18n.localize('CoC7.ExtremeSuccess');
			for (let index = 0; index <  this.roll.successLevel; index++) {
				this.roll.rollIcons.push( 'star');
			} 
		} else {
			this.roll.rollColor = 'black';
			this.roll.rollTitle = game.i18n.localize('CoC7.Failure');
			this.roll.rollIcons.push( 'skull');
		}

		if( !this.targetCard && !this.autoSuccess){
			const resolutionCard = new CoC7MeleeResoltion( this.parentMessageId, this.messageId);
			const resolutionMessage = await resolutionCard.preCreateMessage();
			this.resolutionCard = resolutionMessage.id;
		}
		await this.updateChatCard();
	}

	static getFromCard( card, messageId = null){
		const initiator = new CoC7MeleeInitiator();
		chatHelper.getObjectFromElement( initiator, card);
		initiator.roll = CoC7Roll.getFromCard( card);
		
		if( card.closest('.message'))
			initiator.messageId = card.closest('.message').dataset.messageId;
		else initiator.messageId = messageId;
		return initiator;
	}

	static getFromMessageId( messageId){
		const message = game.messages.get( messageId);
		if( ! message) return null;
		const card = $(message.data.content)[0];

		const initiator = CoC7MeleeInitiator.getFromCard( card, messageId);
		initiator.messageId = messageId;

		return initiator;
	}
	
	static updateCardSwitch( event, publishUpdate = true){
		const card = event.currentTarget.closest('.melee.initiator');
		const flag = event.currentTarget.dataset.flag;
		const camelFlag = chatHelper.hyphenToCamelCase(flag);

		//update only for local player
		if( !publishUpdate){
			card.dataset[camelFlag] = 'true' == card.dataset[camelFlag] ? false : true;
			event.currentTarget.classList.toggle('switched-on');
			event.currentTarget.dataset.selected = card.dataset[camelFlag];
		} else { //update card for all player
			const initiator = CoC7MeleeInitiator.getFromCard( card);
			initiator.toggleFlag(flag);
			initiator.updateChatCard();
		}
	}

	upgradeRoll( luckAmount, newSuccessLevel, oldCard){
		if( !this.actor.spendLuck( luckAmount)) ui.notifications.error(`${token.name} didn't have enough luck to pass the check`);
		this.roll.value = null;
		this.roll.successLevel = newSuccessLevel;
		this.roll.luckSpent = true;
		oldCard.dataset.processed = false;
		
		const diceRolls = oldCard.querySelector('.dice-roll');
		diceRolls.dataset.value = null;
		diceRolls.dataset.successLevel = newSuccessLevel;
		diceRolls.dataset.luckSpent = true;

		const resulDetails = oldCard.querySelector('.result-details');
		const diceTotal = oldCard.querySelector('.dice-total');
		switch (newSuccessLevel) {
		case CoC7Check.successLevel.regular:
			diceTotal.innerText = game.i18n.localize('CoC7.RegularSuccess');
			resulDetails.innerText = game.i18n.format('CoC7.RollResult.LuckSpendText', {luckAmount: luckAmount, successLevel: game.i18n.localize('CoC7.RegularDifficulty')});
			break;
		
		case CoC7Check.successLevel.hard:
			diceTotal.innerText = game.i18n.localize('CoC7.HardSuccess');
			resulDetails.innerText = game.i18n.format('CoC7.RollResult.LuckSpendText', {luckAmount: luckAmount, successLevel: game.i18n.localize('CoC7.HardDifficulty')});
			break;
		
		case CoC7Check.successLevel.extreme:
			if( this.autoSuccess){
				const rollDamageButton = oldCard.querySelector('button[data-action="roll-melee-damage"]');
				if( rollDamageButton) rollDamageButton.dataset.critical = true;
			}
			diceTotal.innerText = game.i18n.localize('CoC7.ExtremeSuccess');
			resulDetails.innerText = game.i18n.format('CoC7.RollResult.LuckSpendText', {luckAmount: luckAmount, successLevel: game.i18n.localize('CoC7.ExtremeDifficulty')});
			break;
		
		case CoC7Check.successLevel.critical:
			if( this.autoSuccess){
				const rollDamageButton = oldCard.querySelector('button[data-action="roll-melee-damage"]');
				if( rollDamageButton) rollDamageButton.dataset.critical = true;
			}
			diceTotal.innerText = game.i18n.localize('CoC7.CriticalSuccess');
			resulDetails.innerText = game.i18n.format('CoC7.RollResult.LuckSpendText', {luckAmount: luckAmount, successLevel: game.i18n.localize('CoC7.CriticalDifficulty')});
			break;
		
		default:
			break;
		}

		diceTotal.classList.replace( 'failure', 'success');
		oldCard.querySelector('.card-buttons').remove();
		oldCard.querySelector('.dice-tooltip').style.display = 'none';
		CoC7Chat.updateChatCard( oldCard);
	}
}

export class CoC7MeleeTarget{
	constructor(actorKey, parentMessageId = null, fastForward = false) {
		this.actorKey = actorKey;
		this.initiatorKey = null;
		this.parentMessageId = parentMessageId;
		this.fastForward = fastForward;
		this.resolved = false;

		this.outnumbered = false;
		this.surprised = false;
		this.autoSuccess = false;
		this.advantage = false;
		this.disadvantage = false;

		this.messageId = null;
		this.skillId = null;
		this.itemId = null;
		this.dodging = false;
		this.fightingBack = false;
		this.maneuvering = false;
	}

	
	get isBlind(){
		return 'blindroll' === this.rollMode;
	}

	get rollMode(){
		if( !this._rollMode) this._rollMode = game.settings.get('core', 'rollMode');
		return this._rollMode;
	}

	set rollMode(x){
		this._rollMode = x;
	}

	get actor(){
		return chatHelper.getActorFromKey( this.actorKey);
	}

	get token(){
		return chatHelper.getTokenFromKey( this.actorKey);
	}

	get weapon(){
		return this.actor.getOwnedItem( this.itemId);
	}

	get skill(){
		return this.actor.getOwnedItem( this.skillId);
	}

	get actionSelected(){
		return this.dodging || this.fightingBack || this.maneuvering;
	}

	get action(){
		if( this.dodging) return 'dodge';
		if( this.fightingBack) return 'fightBack';
		if( this.maneuvering) return 'maneuver';
		return null;
	}

	get initiator(){
		if( !this.initiatorKey) return null;
		return chatHelper.getTokenFromKey( this.initiatorKey);
	}

	get targetImg(){
		if( this.initiator){
			if( this.initiator.actor.isToken) return this.initiator.data.img;
			return this.initiator.actor.img;
		}
		return '../icons/svg/mystery-man-black.svg';
	}

	template = 'systems/CoC7/templates/chat/combat/melee-target.html';

	static getFromMessageId( messageId){
		const message = game.messages.get( messageId);
		if( ! message) return null;
		const card = $(message.data.content)[0];

		const target = CoC7MeleeTarget.getFromCard( card, messageId);
		target.messageId = messageId;

		return target;
	}

	static updateCardSwitch( event, publishUpdate = true){
		const card = event.currentTarget.closest('.melee.target');
		const flag = event.currentTarget.dataset.flag;
		const camelFlag = chatHelper.hyphenToCamelCase(flag);

		//update only for local player
		if( !publishUpdate){
			card.dataset[camelFlag] = 'true' == card.dataset[camelFlag] ? false : true;
			event.currentTarget.classList.toggle('switched-on');
			event.currentTarget.dataset.selected = card.dataset[camelFlag];
		} else { //update card for all player
			const target = CoC7MeleeTarget.getFromCard( card);
			target.toggleFlag(flag);
			target.updateChatCard();
		}
	}

	toggleFlag( flagName){
		const flag = flagName.includes('-') ? chatHelper.hyphenToCamelCase( flagName) : flagName;
		this[flag] = !this[flag];
	}

	async createChatCard(){
		const html = await renderTemplate(this.template, this);
		
		const speaker = ChatMessage.getSpeaker({token: this.token});
		if( this.actor.isToken) speaker.alias = this.actor.token.name;
		
		const user = this.actor.user ? this.actor.user : game.user;

		const chatData = {
			user: user._id,
			speaker,
			content: html
		};

		// Add image to card.
		// data.flags = {
		// 	img: this.actor.isToken ? this.actor.token.data.img: this.actor.img
		// };

		if ( ['gmroll', 'blindroll'].includes(this.rollMode) ) chatData['whisper'] = ChatMessage.getWhisperRecipients('GM');
		if ( this.isBlind ) chatData['blind'] = true;

		const message = await ChatMessage.create(chatData);
		
		this.messageId = message.id;
		return message;
	}

	async updateChatCard(){
		let html = await renderTemplate(this.template, this);
		const message = game.messages.get( this.messageId);

		const msg = await message.update({ content: html });
		await ui.chat.updateMessage( msg, false);
		return msg;
	}

	async getUpdatedChatCard(){
		renderTemplate(this.template, this).then( html => {return html;});
	}

	static async updateSelected( card, event){
		const target = CoC7MeleeTarget.getFromCard( card);

		switch (event.currentTarget.dataset.action) {
		case 'dodge':
			target.dodging = true;
			target.fightingBack = false;
			target.maneuvering = false;
			target.skillId = event.currentTarget.dataset.skillId;
			target.itemId = null;
			break;
		
		case 'fightBack':
			target.dodging = false;
			target.fightingBack = true;
			target.maneuvering = false;
			target.skillId = event.currentTarget.dataset.skillId;
			target.itemId = event.currentTarget.dataset.weaponId;
			break;

		case 'maneuver':
			target.dodging = false;
			target.fightingBack = false;
			target.maneuvering = true;
			target.skillId = event.currentTarget.dataset.skillId;
			target.itemId = null;
			break;

		default:
			break;
		}

		target.updateChatCard();

		return target;
	}

	async performSkillCheck( skillId = null, publish = false){
		const check = new CoC7Check();
		check.referenceMessageId = this.messageId;
		check.rollType= 'opposed';
		check.side = 'target';
		check.action = this.action;
		check.actor = this.actor;
		check.item = this.itemId;
		check.skill = skillId;
		check.difficulty = CoC7Check.difficultyLevel.regular;
		check.diceModifier = 0;

		if( this.disadvantage) check.diceModifier -= 1;
		if( this.advantage) check.diceModifier += 1;

		check.roll();
		this.check = check;
		this.rolled = true;
		this.resolved = true;
		if( publish) check.toMessage();


		// const initiator = CoC7MeleeInitiator.getFromMessageId( this.parentMessageId);

		return check;
	}

	async publishCheckResult( check = null){
		if( !check && !this.check) return null;

		if( check) this.check = check;
		this.roll = CoC7Roll.getFromCheck( this.check);
		this.rolled = true;

		this.roll.rollIcons = [];
		if( this.roll.critical){
			this.roll.rollColor = 'goldenrod';
			this.roll.rollTitle = game.i18n.localize('CoC7.CriticalSuccess');
			for( let index = 0; index < 4; index++){
				this.roll.rollIcons.push( 'medal');
			}
		} else if(  this.roll.fumble) {
			this.roll.rollColor = 'darkred';
			this.roll.rollTitle = game.i18n.localize('CoC7.Fumble');
			for( let index = 0; index < 4; index++){
				this.roll.rollIcons.push( 'spider');
			}
		}else if(  this.roll.success){
			this.roll.rollColor = 'goldenrod';
			if( CoC7Check.successLevel.regular ==  this.roll.successLevel )  this.roll.rollTitle = game.i18n.localize('CoC7.RegularSuccess');
			if( CoC7Check.successLevel.hard ==  this.roll.successLevel )  this.roll.rollTitle = game.i18n.localize('CoC7.HardSuccess');
			if( CoC7Check.successLevel.extreme ==  this.roll.successLevel )  this.roll.rollTitle = game.i18n.localize('CoC7.ExtremeSuccess');
			for (let index = 0; index <  this.roll.successLevel; index++) {
				this.roll.rollIcons.push( 'star');
			} 
		} else {
			this.roll.rollColor = 'black';
			this.roll.rollTitle = game.i18n.localize('CoC7.Failure');
			this.roll.rollIcons.push( 'skull');
		}

		const resolutionCard = new CoC7MeleeResoltion( this.parentMessageId, this.messageId);
		const resolutionMessage = await resolutionCard.preCreateMessage();

		this.resolutionCard = resolutionMessage.id;
		await this.updateChatCard();
	}

	static getFromCard( card, messageId = null){
		const actorKey = card.dataset.actorKey;
		const parentMessageId = card.dataset.parentMessageId;
		const fastForward = 'true' == card.dataset.fastForward;
		const target = new CoC7MeleeTarget( actorKey, parentMessageId, fastForward);
		
		target.roll = CoC7Roll.getFromCard( card);
		chatHelper.getObjectFromElement( target, card);

		if( card.closest('.message'))
			target.messageId = card.closest('.message').dataset.messageId;
		else target.messageId = messageId;
		return target;

	}

	upgradeRoll( luckAmount, newSuccessLevel, oldCard){
		if( !this.actor.spendLuck( luckAmount)) ui.notifications.error(`${token.name} didn't have enough luck to pass the check`);
		this.roll.value = null;
		this.roll.successLevel = newSuccessLevel;
		this.roll.luckSpent = true;
		oldCard.dataset.processed = false;
		
		const diceRolls = oldCard.querySelector('.dice-roll');
		diceRolls.dataset.value = null;
		diceRolls.dataset.successLevel = newSuccessLevel;
		diceRolls.dataset.luckSpent = true;

		const resulDetails = oldCard.querySelector('.result-details');
		const diceTotal = oldCard.querySelector('.dice-total');
		switch (newSuccessLevel) {
		case CoC7Check.successLevel.regular:
			diceTotal.innerText = game.i18n.localize('CoC7.RegularSuccess');
			resulDetails.innerText = game.i18n.format('CoC7.RollResult.LuckSpendText', {luckAmount: luckAmount, successLevel: game.i18n.localize('CoC7.RegularDifficulty')});
			break;
		
		case CoC7Check.successLevel.hard:
			diceTotal.innerText = game.i18n.localize('CoC7.HardSuccess');
			resulDetails.innerText = game.i18n.format('CoC7.RollResult.LuckSpendText', {luckAmount: luckAmount, successLevel: game.i18n.localize('CoC7.HardDifficulty')});
			break;
		
		case CoC7Check.successLevel.extreme:
			diceTotal.innerText = game.i18n.localize('CoC7.ExtremeSuccess');
			resulDetails.innerText = game.i18n.format('CoC7.RollResult.LuckSpendText', {luckAmount: luckAmount, successLevel: game.i18n.localize('CoC7.ExtremeDifficulty')});
			break;
		
		case CoC7Check.successLevel.critical:
			diceTotal.innerText = game.i18n.localize('CoC7.CriticalSuccess');
			resulDetails.innerText = game.i18n.format('CoC7.RollResult.LuckSpendText', {luckAmount: luckAmount, successLevel: game.i18n.localize('CoC7.CriticalDifficulty')});
			break;
		
		default:
			break;
		}

		diceTotal.classList.replace( 'failure', 'success');
		oldCard.querySelector('.card-buttons').remove();
		oldCard.querySelector('.dice-tooltip').style.display = 'none';
		CoC7Chat.updateChatCard( oldCard);
	}
}

export class CoC7MeleeResoltion{
	constructor(initiatorMessage = null, targetMessage = null, messageId = null) {
		this.initiatorMessage = initiatorMessage;
		this.targetMessage = targetMessage;
		this.messageId = messageId;
	}

	async preCreateMessage(){
		const html = await renderTemplate(this.template, this);
		
		// const speaker = ChatMessage.getSpeaker({actor: this.actor});
		// if( this.actor.isToken) speaker.alias = this.actor.token.name;
		
		// const user = this.actor.user ? this.actor.user : game.user;

		const chatData = {
			user: game.user._id,
			content: html
		};

		// Add image to card.
		// data.flags = {
		// 	img: this.actor.isToken ? this.actor.token.data.img: this.actor.img
		// };
		
		let rollMode = game.settings.get('core', 'rollMode');
		if ( ['gmroll', 'blindroll'].includes(rollMode) ) chatData['whisper'] = ChatMessage.getWhisperRecipients('GM');
		if ( rollMode === 'blindroll' ) chatData['blind'] = true;

		const chatMessage = await ChatMessage.create(chatData);
		this.messageId = chatMessage.id;
		return chatMessage;
	}

	get target(){
		if(this.targetMessage) return CoC7MeleeTarget.getFromMessageId(this.targetMessage);
		return null;
	}

	get targetToken(){
		if( this.target) return chatHelper.getTokenFromKey( this.target.actorKey);
		return null;
	}

	get initiator(){
		if(this.initiatorMessage) return CoC7MeleeInitiator.getFromMessageId(this.initiatorMessage);
		return null;
	}

	get initiatorToken(){
		if( this.initiator) return chatHelper.getTokenFromKey( this.initiator.actorKey);
		return null;
	}


	async resolve(){
		if( this.target){
			switch (this.target.action) {
			case 'dodge':
				if( this.initiator.roll.successLevel <= 0 && this.target.roll.successLevel <= 0){
					this.resultString = 'Both side failed.';
					this.winner = null;
					this.rollDamage = false;
				}
				else if( this.initiator.roll.successLevel > this.target.roll.successLevel){
					this.resultString = `${this.initiator.token.name} won. Roll damage`;
					this.winner = this.initiator;
					this.action = 'roll-melee-damage';
					this.rollDamage = true;
				}
				else if( this.initiator.roll.successLevel <= this.target.roll.successLevel){
					this.resultString = `${this.target.token.name} dodged.`;
					this.winner = this.target;
					this.action = 'dodge';
					this.rollDamage = false;
				}
					
				break;
			
			case 'fightBack':
				if( this.initiator.roll.successLevel <= 0 && this.target.roll.successLevel <= 0){
					this.resultString = 'Both side failed.';
					this.winner = null;
					this.rollDamage = false;
				}
				else if( this.initiator.roll.successLevel >= this.target.roll.successLevel){
					this.resultString = `${this.initiator.token.name} won. Roll damage`;
					this.winner = this.initiator;
					this.looser = this.target;
					this.rollDamage = true;
				}
				else if( this.initiator.roll.successLevel <= this.target.roll.successLevel){
					this.resultString = `${this.target.token.name} won. Roll damage`;
					this.winner = this.target;
					this.looser = this.initiator;
					this.rollDamage = true;
				}
					
				break;
			
			case 'maneuver':
				if( this.initiator.roll.successLevel <= 0 && this.target.roll.successLevel <= 0){
					this.resultString = 'Both side failed.';
					this.winner = null;
					this.rollDamage = false;
				}
				else if( this.initiator.roll.successLevel >= this.target.roll.successLevel){
					this.resultString = `${this.initiator.token.name} won. Roll damage`;
					this.winner = this.initiator;
					this.looser = this.target;
					this.rollDamage = true;
				}
				else if( this.initiator.roll.successLevel <= this.target.roll.successLevel){
					this.resultString = `${this.target.token.name} maneuver was successful.`;
					this.winner = this.target;
					this.looser = this.initiator;
					this.rollDamage = false;
				}
					
				break;
			
			default:
				break;
			}
		} else {
			if( this.initiator.roll.successLevel > 0){
				this.resultString = `${this.initiator.token.name} won. Roll damage`;
				this.winner = this.initiator;
				this.rollDamage = true;
			} else {
				this.resultString = `${this.initiator.token.name} missed.`;
				this.winner = this.initiator;
				this.rollDamage = false;

			}
		}

		if( this.winner){
			if( this.winner.roll.successLevel >= CoC7Check.successLevel.extreme) this.winner.roll.criticalDamage = true;
			else this.winner.roll.criticalDamage = false;
		}


		this.resolved = true;
		const html = await renderTemplate(this.template, this);
		if( this.messageId){
			const message = game.messages.get( this.messageId);
			const speaker = this.winner ? ChatMessage.getSpeaker({token: this.winner.token}) : null;
			const user = this.winner ? this.winner.actor.user ? this.winner.actor.user : game.user : game.user;

			let msg;
			if( speaker) msg = await message.update({ 
				user: user._id,
				speaker,
				content: html });
			else  msg = await message.update({ 
				user: user._id,
				content: html });
			await ui.chat.updateMessage( msg, false);
			return msg;
		}
	}

	get template(){
		return 'systems/CoC7/templates/chat/combat/melee-resolution.html';
	}
}
