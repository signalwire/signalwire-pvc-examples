const AIRTABLE_WEBHOOK = "";
const SLACK_APP_ID = "";
const SLACK_ALWAY_COPY = "U0131JSTL2C";
const PRODUCTION_URL = ''
const videoConferenceToken = ''

const participants = [];
const selfMember = {};
let slackMemberList = [];

const  fetchSlackMemberList = async (name, callSlack) => {
  if (callSlack) await getSlackMemberList();
  const d = document.getElementById(name);
  const dataList = slackMemberList.map(m => `<option value=${m.name}> ${m.name} </option>`);
  d.innerHTML += `<input autocomplete="off" list="slack-members" type="text" name="name" id=${name}-data-list placeholder="Select your slack name"  />
  <datalist id="slack-members"> ${dataList}
  </datalist>`;
}


const handleCommand = () => {
  const command =
    document.getElementById("command-input-data-list").value !== ""
      ? document.getElementById("command-input-data-list").value
      : "no command provided";
  if (command != "no command provided") {
    // find the channel id for this person
    const member = slackMemberList.find((m) =>  m.name.toLowerCase() === command.toLowerCase());
    if (!member) {
      alert(`${command} does not have slack ID`);
    } else {
      const message = `${selfMember.name} wants to talk to you at ${PRODUCTION_URL}`
      console.log(member);
      slackChat(message, member.id);
      alert(`Invited ${command} - ${member.id}`);
    }
  }
};

function handleClick() {
  var form = document.getElementById("main-container");
  var video = document.getElementById("video-root");

  selfMember.name =
    document.getElementById("name-holder-data-list").value !== ""
      ? document.getElementById("name-holder-data-list").value
      : "No name provided";
  var email = "";

  if (form === null) {
    console.error("We cannot find the form");
  }
  form.classList.add("hidden");

  var explanationDIV = document.getElementById("explanation");
  explanationDIV.classList.add("hidden");
  
  var s = document.createElement("script");
  s.type = "text/javascript";
  var code = `
      !function(e,r){e.swvr=e.swvr||function(r={}){
      Object.assign(e.swvr.p=e.swvr.p||{},r)}
      ;let t=r.currentScript,n=r.createElement("script")
      ;n.type="module",n.src="https://cdn.signalwire.com/video/rooms/index.js",
      n.onload=function(){let n=r.createElement("ready-room")
      ;n.params=e.swvr.p,t.parentNode.appendChild(n)},t.parentNode.insertBefore(n,t)
      ;let i=r.createElement("link")
      ;i.type="text/css",i.rel="stylesheet",i.href="https://cdn.signalwire.com/video/rooms/signalwire.css",
      t.parentNode.insertBefore(i,t),
      e.SignalWire=e.SignalWire||{},e.SignalWire.Prebuilt={VideoRoom:e.swvr}
      }(window,document);
  
      SignalWire.Prebuilt.VideoRoom({
        token: "${videoConferenceToken}",
        userName: "${selfMember.name}",
        setupRoomSession: (roomSession) => {
          roomSession.on('layout.changed', (params) => handleEvent('Layout Changed', params))
          roomSession.on('member.updated', (params) => handleEvent('Member Updated', params))
          roomSession.on('member.joined', (params) => handleEvent('Member Joined', params))
          roomSession.on('member.left', (params) => handleEvent('Member Leave', params))
          roomSession.on('member.talking', (params) => handleEvent('Talking', params))
          roomSession.on('room.joined', (params) => handleEvent('Room Joined', params))
          roomSession.on('room.updated', (params) => handleEvent('Room Updated', params))
      }});
    `;

  try {
    s.appendChild(document.createTextNode(code));
    video.appendChild(s);
  } catch (e) {
    console.error(`ERROR ${e}`);
    document.body.appendChild(s);
  }
}

// All the EVENT handlers
const handleEvent = (eventName, params) => {
  switch (eventName) {
    case "Talking":
      logTalking(params);
      break;
    case "Room Joined": {
      // create a participant list
      const { call_id, member_id, room, room_session } = params;
      const {
        display_name,
        members,
        preview_url,
        recording,
        room_id,
        room_session_id,
      } = room;
      console.log(
        `my id is ${member_id}, room ${display_name} and members are `,
        members
      );
      members.forEach((member) =>
        participants.push({
          id: member.id,
          name: member.name,
          type: member.type,
          active: true,
          total_time: 0,
          test: "no",
        })
      );
      selfMember.id = params.member_id;
      selfMember.callID = params.call_id;
      selfMember.roomID = params.room.room_id;
      selfMember.roomName = params.room.display_name;
      selfMember.roomSession = params.room_session.id;

      
      sendSlackMessage(
        selfMember.name,
        `${selfMember.name} Joined the room ${selfMember.roomName}`
      );

      break;
    }

    case "Member Leave": {
      const { name, id, type } = params.member;
      // participants[id].active = false;
      participants.find((p) => p.id === id).active = false;
      sendSlackMessage(name, `${name} left the room ${selfMember.roomName}`);
      break;
    }

    case "Member Joined": {
      const { name, id, type } = params.member;
      participants.push({ id, type, name, active: true, total_time: 0 });
      sendSlackMessage(name, `${name} joined the room ${selfMember.roomName}`);
      break;
    }
  }
  airTableLogging(eventName, params);
};

function logTalking(params) {
  const action = params.member.talking ? "Started talking" : "Stopped talking";
  // airTableLogging(action, params);
  calculateTalkingTime(params.member.talking, params);
}

function airTableLogging(event, params) {
  // only send events to airtable if I am the first active member. Otherwise all members
  // will send events to airtable - bad.
  // Also skip talking events
  const member_id = params.member ? params.member.id : "unknown";
  const member_name = params.member ? params.member.name : "unknown";
  const self_name = `${selfMember.name}-${selfMember.id}`;

  if (event.includes("Talking")) {
    return;
  }

  console.log(`EVENT- ${event}`, params);
  if (participants.filter((p) => p.active === true)[0].id !== selfMember.id) {
    return;
  }

  const p = JSON.stringify(params);
  fetch(`${AIRTABLE_WEBHOOK}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "event": event,
      "date" : Date.now(),
      "member_name": member_name,
      "room_name": selfMember.roomName,
      "participants": p
    }),
  })
    .then((result) =>
      console.info(
        "AIRTABLE SUCC: Successfully logged to airtable" +
          JSON.stringify(result)
      )
    )
    .catch((error) =>
      console.error(
        "AIRTABLE ERR: Failed to log to airtable" + JSON.stringify(error), error
      )
    );
  return;
}

function logTalkingTime(timeTracker) {
  const trackerDiv = document.getElementById("talking-time");
  let html = "<h2 class='text-green-500 text-3xl'>Talking Time</h2>";
  html += "<table>";
  html += "<tr> <th> Participant</th>  <th> Duration</th>";

  timeTracker.map((person) => {
    const selfClass = person.id === selfMember.id ? "font-bold" : "";
    if (person.active) {
      return (html += `<tr>
        <td width="400" class="text-green-800 ${selfClass}"> ${
        person.name
      } </td>
          <td width="200"> ${person.total_time / 1000} s</td>
          </tr>`);
    } else {
      return (html += `<tr>
      <td width="400" class="text-red-800 ${selfClass}"> ${person.name} </td>
        <td width="200"> ${person.total_time / 1000} s</td>
        </tr>`);
    }
  });
  html += "</table>";
  trackerDiv.innerHTML = html;
}

function calculateTalkingTime(talkingIndicator, params) {
  const member = params.member.id;

  // let's first find if we have an entry in our talking tracker for this member
  const participantID = participants.findIndex((m) => m.id === member);
  if (participantID === -1) {
    console.error(`Tracker: did not find entry for ${member}`);
    if (talkingIndicator) {
      participants[participantID].start_time = new Date();
      participants[participantID].total_time = 0;
      // participant.push({id: member, start_time: new Date(), total_time: 0});
    } else {
      // this should not happen. This means that we got a stop talking event
      // without first getting a start talking event
      console.error(
        `Tracker. Got a stop talking event for ${member} without a start talking event`
      );
    }
  } else {
    // we found an entry for the member in our talking tracker
    if (talkingIndicator) {
      // person is contiuing to talking
      participants[participantID].start_time = new Date();
    } else {
      // they stopped talking
      if (participants[participantID].start_time === 0) {
        // this is weird
        console.error(
          `Tracker: We found a stop talking event for ${member} with no start time`
        );
      } else {
        // console.log(`CALC: total time is ${participants[participantID].total_time}`)
        if (isNaN(participants[participantID].start_time)) {
          console.error(`ERR: no start time for `, participants[participantID]);
          console.error(params);
          participants[participantID].total_time = 0;
        } else {
          participants[participantID].total_time +=
            new Date() - participants[participantID].start_time;
          participants[participantID].start_time = 0;
        }
        // console.log(`CALC: total time is ${participants[participantID].total_time}`)

        // now set the partitipant talking time
        logTalkingTime(participants);
      }
    }
  }
}

const getSlackMemberList = async () => {
  if (slackMemberList.length !== 0) return; 

  const payload = {
    token: SLACK_APP_ID
  };

  await fetch("https://slack.com/api/users.list?pretty=1", {
    method: "POST",
    body: new URLSearchParams(payload),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`SLACK: Server error ${res.status}`);
      }
      const response = await res.json();

      response.members.forEach((member) => {
      
        if (!member.deleted && !member.is_restricted && member.is_email_confirmed && !member.is_app_user && !member.is_bot) slackMemberList.push(member);
      });

      console.log("MEMBER LIST", slackMemberList);

      return response;
    })
    .catch((error) => {
      console.error(error);
    });
};

const sendSlackMessage = (name, msg) => {
  // only send events to slack if I am the first active member.
  const activeParticipants = participants.filter((p) => p.active === true);
  if (!activeParticipants || activeParticipants[0].id !== selfMember.id) return;

  slackChat(`cc - ${msg}`, SLACK_ALWAY_COPY);

  // now send the message to all active participants
  participants.forEach((participant) => {
    if (!participant.active) return;
    const slackMember = slackMemberList.find(
      (m) => m.name.toLowerCase() === participant.name.toLowerCase()
    );
    if (!slackMember) return;
    slackChat(msg, slackMember.id);
  });
};

const slackChat = (msg, channelID) => {
  const payload = {
    token: SLACK_APP_ID,
    channel: channelID,
    text: msg,
  };

  fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    body: new URLSearchParams(payload),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`SLACK2: Server error ${res.status}`);
      }
      return res.json();
    })
    .catch((error) => {
      console.error(error);
    });
};
