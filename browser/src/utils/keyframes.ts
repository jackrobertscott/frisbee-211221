import {keyframes} from '@emotion/css'
/**
 *
 */
export const spin = keyframes(`
  0% {
    transform: rotateZ(0deg);
  }
  100% {
    transform: rotateZ(360deg);
  }
`)
/**
 *
 */
export const fadeup = keyframes(`
  0% {
    opacity: 0;
    transform: translateY(5px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
`)
/**
 *
 */
export const fadedown = keyframes(`
  0% {
    opacity: 0;
    transform: translateY(-5px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
`)
/**
 *
 */
export const fadein = keyframes(`
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
`)
/**
 *
 */
export const slideright = keyframes(`
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(0);
  }
`)
/**
 *
 */
export const shake = keyframes(`
  0%, 100% {
    transform: translateX(0);
  }
  10%, 90% {
    transform: translateX(-1px);
  }
  20%, 80% {
    transform: translateX(2px);
  }
  30%, 50%, 70% {
    transform: translateX(-4px);
  }
  40%, 60% {
    transform: translateX(4px);
  }
`)
