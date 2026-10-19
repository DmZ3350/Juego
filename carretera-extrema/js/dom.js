/**
 * Referencias al DOM. Un solo lugar para queries.
 */

export const canvas = document.getElementById('game');
export const ctx = canvas.getContext('2d');
export const overlay = document.getElementById('overlay');
export const wrapEl = document.querySelector('.wrap');
export const scoreEl = document.getElementById('score');
export const bestEl = document.getElementById('best');
export const pauseBtn = document.getElementById('pauseBtn');
export const pauseOverlay = document.getElementById('pauseOverlay');
export const muteMusicBtn = document.getElementById('muteMusicBtn');
export const muteSfxBtn = document.getElementById('muteSfxBtn');
export const leftBtn = document.getElementById('left');
export const rightBtn = document.getElementById('right');
export const fireBtn = document.getElementById('fire');
export const fireFloatBtn = document.getElementById('fireFloat');
export const resumeBtn = document.getElementById('resumeBtn');
