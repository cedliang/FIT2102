import {of,  interval, fromEvent, from, zip, Observable } from 'rxjs'
import {  map, scan, filter,  flatMap, take, concat, subscribeOn, takeUntil,merge} from 'rxjs/operators'

type Key = 'ArrowDown' | 'ArrowUp' | 'Enter'
type Event = 'keydown' | 'keyup'

function pong() {
  const playerpaddle = document.getElementById("playerpaddle")
  const AIpaddle = document.getElementById("computerpaddle")
  const ball = document.getElementById("ball")
  const playerHTMLscore = document.getElementById("playerScore")
  const loseWinIndicator = document.getElementById("loseWin")

  //Gamestate container type. These are all the numbers that should sufficiently describe the state of the game at any given moment.
  type State = Readonly<{
    //x component velocity of the ball
    ballxvel: number,

    //y component velocity of the ball
    ballyvel: number,

    //x coordinate of the ball
    ballx: number,

    //y coordinate of the ball
    bally: number,

    //y coordinate of the top left hand corner of the player's paddle
    playerpaddley: number,

    //instantaneous velocity of the player's paddle 
    //(necessary since the update to a player's y position is only performed at the next tick! 
    //If the gamestate is altered by keyboard input, it's necessary to keep track of this value to tell the next tick how to display the game)
    playerpaddleyvel: number,
    
    //y coordinate of the top left of the AI paddle. velocity variable is not necessary for this since it follows the ball
    aipaddley: number,

    //scores of the player and AI
    playerscore:number,
    aiscore:number,

    //number describing whether the game is running or not. can be 1, 0 or -1
    //
    //1 = game is running
    //0 = player win
    //-1 = ai win
    gamerunning:number
  }>

  const initialGameState: State = {ballxvel: -1.5,
                                ballyvel: (Math.random()*5)-2.5,
                                ballx: 298,
                                bally: 298,
                                playerpaddley: 280,
                                playerpaddleyvel: 0,
                                aipaddley: 280,
                                playerscore: 0,
                                aiscore: 0,
                                gamerunning: 1}

  //updates the HTML document based on the gamestate
  function updateView(state:State): void {
    //these move things around
    playerpaddle.setAttribute('y', String(state.playerpaddley))
    AIpaddle.setAttribute('y', String(state.aipaddley))
    ball.setAttribute('y', String(state.bally))
    ball.setAttribute('x', String(state.ballx))
    
    //these update the score
    playerHTMLscore.innerHTML = "Player "+ String(state.playerscore)+":"+String(state.aiscore)+" AI"

    //these tell you if you just got your arse kicked by the AI
    state.gamerunning === 1? loseWinIndicator.innerHTML = "" :
    state.gamerunning === 0? loseWinIndicator.innerHTML = "Player Wins! Press Enter to restart." :
    loseWinIndicator.innerHTML = "AI Wins! Press Enter to restart."
  }

  class Tick { constructor(public readonly elapsed:number) {} }
  class movePlayerPaddle { constructor(public readonly translation:number) {} }
  class restartGame { constructor() {} }

  //takes in a state and the intended translation of the player paddle, returns a *number*, representing the new y coordinate of the paddle
  //calibrated such that the paddle cannot leave the canvas
  const shiftPlayerPaddle = (s:State, deflection:number) =>( 
    s.playerpaddley + deflection >=560? 560 :
    s.playerpaddley + deflection <= 0? 0:
    s.playerpaddley + deflection)

  //similar stuff, but for AI. since the AI paddle follows the ball, the intended translation is not required as an argument
  //returns once again a *number* representing the new y coordinate of the AI paddle
  const shiftaipaddley = (s:State) => (s.bally <= 20)? 0 : (s.bally >= 580)? 560: s.bally - 20

  //calculates a new xvelocity and x position for the ball based on the current gamestate.
  //returns a new GAMESTATE (not just numbers!)
  //checks for collisions of the ball against the paddles
  //if it hits the paddles, the x velocity is multiplied by -1
  const collisionBallX = (s: State) =>  
    //collision with player paddle, hardcoded paddle x, tolerance of 4 pixels
    ((s.ballx <= 57 && s.ballx >= 53) && (s.bally <= s.playerpaddley+40 && s.bally >= s.playerpaddley))?  
    {...s,
      ballxvel:-1*s.ballxvel,
      ballx: 58
    }: 
    //collision with AI paddle
    ((s.ballx <= 552 && s.ballx >= 548) && (s.bally <= s.aipaddley+40 && s.bally >= s.aipaddley))?
      {...s,
        ballxvel:-1*s.ballxvel,
        ballx: 547
      }: 
    //no collision with any paddle, the ball continues on its way
      {...s,
        ballxvel:s.ballxvel,
        ballx: s.ballx+s.ballxvel
      } 

  //calculates new y coordinates and velocities for the ball, depending on the gamestate. returns a new gamestate!
  //checks for collisions with the paddles and the ceiling and floor
  const collisionBallY = (s: State) => (s.bally >= 596)? 
    //collision with the roof case
    {...s,
    ballyvel:-1*s.ballyvel,
    bally: 595
    }
    //hit the floor?
    :(s.bally <= 0)?
    //collision with the floor case
    {...s,
    ballyvel:-1*s.ballyvel,
    bally: 1
    }:
    //hit player paddle case
    ((s.ballx <= 57 && s.ballx >= 53) && (s.bally <= s.playerpaddley+40 && s.bally >= s.playerpaddley))?(
      //ball is moving downwards
      (s.ballyvel > 0)?
        //maps the y location on the paddle that the ball hits to a coefficient for the velocity of the ball after collision.
        //hitting the very top of the paddle results in a y velocity being multiplied by -1.5, and this coefficient scales
        //linearly up to 3.0 when hitting the very bottom of the paddle
        //I've also included a random number generator, which will multiply this coefficient by a random number between 1 and 1.5  
        {...s, 
          ballyvel: (((s.bally-s.playerpaddley)*(4.5/40))-1.5)*((Math.random()*0.5)+1)*s.ballyvel,
        bally: s.bally + s.ballyvel}:
      //ball is moving upwards
        {...s, 
        ballyvel: (((s.bally-s.playerpaddley)*(-4.5/40))+3.0)*((Math.random()*0.5)+1)*s.ballyvel,
        bally: s.bally + s.ballyvel}):    
    //ball hits AI paddle
    ((s.ballx <= 552 && s.ballx >= 548) && (s.bally <= s.aipaddley+40 && s.bally >= s.aipaddley))?
        //50% chance that the y velocity is completely randomised when it hits the AI paddle, to make things more interesting
        Math.random()<0.5?
          {...s, 
          ballyvel: (Math.random()*12)-6,
          bally: s.bally + s.ballyvel}: 
        //ball is moving downwards
          ((s.ballyvel > 0)?
          {...s, 
            ballyvel: (((s.bally-s.aipaddley)*(4.5/40))-1.5)*((Math.random()*0.5)+1)*s.ballyvel,
            bally: s.bally + s.ballyvel}:
        //ball moving upwards
          {...s, 
            ballyvel: (((s.bally-s.aipaddley)*(-4.5/40))+3.0)*((Math.random()*0.5)+1)*s.ballyvel,
            bally: s.bally + s.ballyvel}):
    //ball collides with nothing and continues on its path
    {...s, 
      ballyvel: s.ballyvel,
      bally: s.bally + s.ballyvel}
    
  //returns true if the ball has hit the ai wall, false otherwise
  const checkwallai = (s: State) => s.ballx > 600 ? true:false
  //returns true if the ball has hit the player wall, false otherwise
  const checkwallplayer = (s: State) => s.ballx < 0 ? true:false

  //defines a set of observables that correspond to input streams for keys that control the game
  const keyObservable = <T>(e:Event, k:Key, result:()=>T)=>
    fromEvent<KeyboardEvent>(document,e)
        .pipe(
          filter(({key})=>key === k),
          filter(({repeat})=>!repeat),
          map(result)),
    startDown = keyObservable('keydown','ArrowDown',()=>new movePlayerPaddle(5)),
    startUp = keyObservable('keydown','ArrowUp',()=>new movePlayerPaddle(-5)),
    stopDown = keyObservable('keyup','ArrowDown',()=>new movePlayerPaddle(0)),
    stopUp = keyObservable('keyup','ArrowUp',()=>new movePlayerPaddle(0)),
    restartUp = keyObservable('keyup','Enter',()=>new restartGame())
  
  //evaluates the next state based on the current gamestate and the next event in the stream
  //this is where the magic happens!
  const reduceState = (s:State, e:movePlayerPaddle|Tick|restartGame)=>
    e instanceof movePlayerPaddle ? {...s,
      playerpaddleyvel: e.translation}:     
    //only permits restarting the game if the game is not currently running
    e instanceof restartGame ? ((s.gamerunning<1)? initialGameState : s): 

    //EVERYTHING BELOW IS IN THE EVENT OF A TICK
    (s.playerscore === 7)?
    //playerwin
      {
        ballxvel: 0,
        ballyvel: 0,
        ballx: -298,
        bally: 298,
        playerpaddley: 280,
        playerpaddleyvel: 0,
        aipaddley: 280,
        playerscore:s.playerscore,
        aiscore:s.aiscore,
        gamerunning:0
      }:
    (s.aiscore === 7)?
    //aiwin
      {
        ballxvel: 0,
        ballyvel: 0,
        ballx: -298,
        bally: 298,
        playerpaddley: 280,
        playerpaddleyvel: 0,
        aipaddley: 280,
        playerscore:s.playerscore,
        aiscore:s.aiscore,
        gamerunning:-1
      }:    
    checkwallplayer(s)?
      //ball hits player wall
      {
        ballxvel: -1.5,
        ballyvel: (Math.random()*5)-2.5,
        ballx: 298,
        bally: 298,
        playerpaddley: 280,
        playerpaddleyvel: 0,
        aipaddley: 280,
        playerscore:s.playerscore,
        aiscore:s.aiscore+1,
        gamerunning:1
      }:
    checkwallai(s)?
      //ball hits ai wall
      {
        ballxvel: -1.5,
        ballyvel: (Math.random()*5)-2.5,
        ballx: 298,
        bally: 298,
        playerpaddley: 280,
        playerpaddleyvel: 0,
        aipaddley: 280,
        playerscore:s.playerscore+1,
        aiscore:s.aiscore,
        gamerunning:1
      }:
    //normal tick
    {...s,
      playerpaddley: shiftPlayerPaddle(s, s.playerpaddleyvel),
      playerpaddleyvel:s.playerpaddleyvel,

      aipaddley: shiftaipaddley(s),
      
      ballx: collisionBallX(s).ballx,
      ballxvel: collisionBallX(s).ballxvel,

      bally: collisionBallY(s).bally,
      ballyvel: collisionBallY(s).ballyvel};

  interval(10)
    .pipe(
      map(elapsed=>new Tick(elapsed)),
      merge(
        startDown, startUp, stopDown, stopUp, restartUp),
      scan(reduceState, initialGameState)
    ).subscribe(updateView);
  }
  
  // the following simply runs your pong function on window load.  Make sure to leave it in place.
  if (typeof window != 'undefined')
    window.onload = ()=>{
      pong();
    }
  
  

