var express = require('express')
var app = express();
var axios = require('axios');
var cors = require('cors');
var web3 = require('@solana/web3.js');
var anchor = require('@coral-xyz/anchor');
require('dotenv').config();
var sha3 = require('@noble/hashes/sha3');

const path_idl = require("./bgl_path_validator.json");
const track_idl = require("./wallet_tracker.json");

app.set('port', (process.env.PORT || 5000))
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'ejs');
app.set('views', __dirname + '/public');
app.use(cors());

app.get('/', function (request, response) {
  response.render('index.html')
})

app.get('/nfts/:wallID', async function (request, response) {
  network = "mainnet-beta";
  wallID = request.params.wallID;

  const nftUrl = `https://api.shyft.to/sol/v1/nft/compressed/read_all?network=${network}&wallet_address=${wallID}`;
  try {
    // let res = await axios({
    //   // Endpoint to send files
    //   url: nftUrl,
    //   method: "GET",
    //   headers: {
    //     "Content-Type": "application/json",
    //     "x-api-key": xKey,
    //   },
    // });

    // console.log(res.data.result.nfts);
    // let result = res.data.result.nfts;
    let result = await fetchNFTs(wallID, network, "7AA1QE6pFYchfFaMiSsdnceXrMJ1JSPg42m8EDTKUwbq", "3AajDgUy6p8cYNr7FUGjN1tsph1PdNdqcp7bHmHVdqsB");
    console.log(result)
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error);
  }
})

app.get('/proof/:path/:leaf_id/:wallet', async function (request, response) {
  network = "mainnet-beta";
  path = new Uint8Array(Buffer.from(request.params.path, 'base64'));
  console.log(path);
  leaf_id = new web3.PublicKey(request.params.leaf_id);
  console.log(leaf_id);
  wallet = new web3.PublicKey(request.params.wallet);
  console.log(wallet);
  // otherProof = request.params.proof;
  // console.log(otherProof);

  const connection = new web3.Connection(process.env.RPC_URL, 'confirmed');
  const secret = JSON.parse(process.env.AUTH_KEY);
  const secretKey = Uint8Array.from(secret);
  const authority = web3.Keypair.fromSecretKey(secretKey);

  let tx = new web3.Transaction();
  let proof = await submitProof(
    connection,
    authority,
    path,
    leaf_id,
    // otherProof,
  );
  if (!proof) {
    response.status(400).json({ error: "Invalid proof" });
    return;
  }
  tx = tx.add(await claimProof(
    connection,
    authority,
    leaf_id,
    wallet,
  ));


  tx.feePayer = new web3.PublicKey(wallet);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.partialSign(authority);
  // console.log(JSON.stringify(tx, null, 2));

  response.status(200).json({ tx: tx.serialize({ requireAllSignatures: false }).toString("base64") });

  // const nftUrl = `https://api.shyft.to/sol/v1/nft/compressed/read_all?network=${network}&wallet_address=${wallID}`;
  // try {
  //   // let res = await axios({
  //   //   // Endpoint to send files
  //   //   url: nftUrl,
  //   //   method: "GET",
  //   //   headers: {
  //   //     "Content-Type": "application/json",
  //   //     "x-api-key": xKey,
  //   //   },
  //   // });

  //   // console.log(res.data.result.nfts);
  //   // let result = res.data.result.nfts;
  //   let result = await fetchNFTs(wallID, network, "GLnGAzUD2AvtsW3oNAL2Sh3rt8ifcacErnHJGG4ve1Yd", "DhYCi6pvfhJkPRpt5RjYwsE1hZw84iu6twbRt9B6dYLV");
  //   console.log(result)
  //   response.setHeader('Content-Type', 'application/json');
  //   response.end(JSON.stringify(result, null, 2));
  // } catch (error) {
  //   console.error(error);
  // }
})

app.get('/check/:leaf_id/:wallet', async function (request, response) {
  network = "mainnet-beta";
  leaf_id = new web3.PublicKey(request.params.leaf_id);
  console.log(leaf_id);
  console.log(leaf_id.toBytes());
  wallet = new web3.PublicKey(request.params.wallet);
  console.log(wallet);
  // otherProof = request.params.proof;
  // console.log(otherProof);

  const connection = new web3.Connection(process.env.RPC_URL, 'confirmed');
  const secret = JSON.parse(process.env.AUTH_KEY);
  const secretKey = Uint8Array.from(secret);
  const authority = web3.Keypair.fromSecretKey(secretKey);

  const result = await checkForProof(connection, authority, leaf_id, wallet)
  if (result) {
    response.status(200).send();;
  } else {
    response.status(400).send();
  }
})

app.listen(app.get('port'), function () {
  console.log("Node app is running at localhost:" + app.get('port'))
})

const fetchNFTs = async (wallID, network, collection, creator) => {

  const nftUrl = `https://api.shyft.to/sol/v1/nft/compressed/read_all?network=${network}&wallet_address=${wallID}`;
  try {
    let res = await axios({
      // Endpoint to send files
      url: nftUrl,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": xKey,
      },
    });

    let result = res.data.result.nfts.filter((nft) => {
      console.log(nft.collection);
      if (nft.collection && nft.creators && nft.creators.length > 0) {
        return (nft.collection.address === collection) && (nft.creators[0].address === creator) && nft.creators[0].address;
      }
    });
    // console.log(result)
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}

const TREASURY = new web3.PublicKey("patht4uEaSDieLqjU4EZ8PZRWs2dPCQMqorCTZhVPMB");

async function submitProof(connection, authority, path, leaf_id) {
  const programID = new web3.PublicKey('PATHrLe2WkDq1WS9df5dSuZ5MhnZZzGZmXcj4wGFCys');
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(authority), { skipPreflight: true, commitment: 'finalized', maxRetries: 100 });
  const program = new anchor.Program(path_idl, programID, provider);

  //TODO remove
  // const proof = hashPath(path);
  // let hash = "";
  // proof?.forEach((byte) => {hash = hash + byte.toString(16)});

  // console.log("Proof/Path: ", proof, ":", path);
  // let solution = Uint8Array.from(Buffer.from(await getProofFromAsset(leaf_id), 'hex'));
  // let solution = await getProofFromAsset(leaf_id);
  // console.log("proof:", hash);
  // console.log("otherProof:", otherProof);
  // console.log("solution:", solution);
  return await checkSolution(leaf_id, path);

  // let ix = await program.methods
  //   .validateU8({ proof: Array.from(proof), path: Buffer.from(path) })
  //   .accounts({
  //     payer: authority.publicKey,
  //     treasury: TREASURY,
  //   })
  //   .instruction();
  // // tx.partialSign(authority);

  // return ix;
}

async function claimProof(connection, authority, leaf_id, wallet) {
  const programID = new web3.PublicKey('TRCKTiWtWCzCopm4mnR47n4v2vEvjRQ1q6rsDxRUbVR');

  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(authority), { skipPreflight: true, commitment: 'finalized', maxRetries: 100 });
  const program = new anchor.Program(track_idl, programID, provider);

  const walletPubkey = new web3.PublicKey(wallet);
  const leafKey = new web3.PublicKey(leaf_id);

  console.log(leaf_id);

  let winProofPDA = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("proof"), authority.publicKey.toBuffer(), walletPubkey.toBuffer(), (leafKey).toBuffer()],
    program.programId
  );

  let walletRecordPDA = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("record"), authority.publicKey.toBuffer(), walletPubkey.toBuffer()],
    program.programId
  );

  let leafRecordPDA = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("record"), authority.publicKey.toBuffer(), (leafKey).toBuffer()],
    program.programId
  );

  // Add your test here.
  let ix = await program.methods
    .claimWinProof(leafKey.toBytes())
    .accounts({
      winProof: winProofPDA[0],
      walletRecord: walletRecordPDA[0],
      leafRecord: leafRecordPDA[0],
      authority: authority.publicKey,
      wallet: wallet,
    })
    .instruction();

  // ix.partialSign(authority);
  return ix;


  // const winProofAccount = await program.account.winProof.fetch(winProofPDA[0]);
  // console.log(winProofAccount);

  // const walletRecordAccount = await program.account.record.fetch(walletRecordPDA[0]);
  // console.log(walletRecordAccount);

  // const leafRecordAccount = await program.account.record.fetch(leafRecordPDA[0]);
  // console.log(leafRecordAccount);
}

async function checkForProof(connection, authority, leaf_id, wallet) {
  const programID = new web3.PublicKey('TRCKTiWtWCzCopm4mnR47n4v2vEvjRQ1q6rsDxRUbVR');

  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(authority), { skipPreflight: true, commitment: 'finalized', maxRetries: 100 });
  const program = new anchor.Program(track_idl, programID, provider);

  const walletPubkey = new web3.PublicKey(wallet);
  const leafKey = new web3.PublicKey(leaf_id);

  let winProofPDA = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("proof"), authority.publicKey.toBuffer(), walletPubkey.toBuffer(), (leafKey).toBuffer()],
    program.programId
  );

  const proof = await program.account.winProof.fetchNullable(winProofPDA[0]);

  if (proof === null) {
    return false;
  } else {
    return true;
  }
}

function hashPath(path) {
  let computedHash = null;
  for (let i = 0; i < path.length; i += 32) {
    const chunk = Uint8Array.from(path.slice(i, i + 32));
    if (computedHash == null) {
      computedHash = sha3.keccak_256(Uint8Array.from([1].concat(chunk)))
    } else {
      computedHash = sha3.keccak_256(Uint8Array.from([1].concat(Array.from(computedHash)).concat(chunk)))
    }
  }
  return computedHash;
}

async function getProofFromAsset(leaf_id) {
  console.log("leaf_id:", leaf_id.toString());
  const network = "mainnet-beta";
  const nftUrl = `https://api.shyft.to/sol/v1/nft/compressed/read?network=${network}&nft_address=${leaf_id.toString()}`;

  try {
    let res = await axios({
      // Endpoint to send files
      url: nftUrl,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": xKey,
      },
    });

    // console.log("response:", res);
    // console.log(result)
    // return result;
    console.log(res.data.result.attributes.Solution);
    return res.data.result.attributes.Solution;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function getMazeFromAsset(leaf_id) {
  console.log("leaf_id:", leaf_id.toString());
  const network = "mainnet-beta";
  const nftUrl = `https://api.shyft.to/sol/v1/nft/compressed/read?network=${network}&nft_address=${leaf_id.toString()}`;

  try {
    let res = await axios({
      // Endpoint to send files
      url: nftUrl,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": xKey,
      },
    });

    // console.log("response:", res);
    // console.log(result)
    // return result;
    // console.log(res.data.result.attributes);
    return [res.data.result.attributes.Map, res.data.result.attributes.Size];
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function checkSolution(leaf_id, path) {
  console.log("Path:", path);
  let [metadata, size] = await getMazeFromAsset(leaf_id);
  console.log("Size:", size);
  // console.log(metadata);
  const maze = JSON.parse(metadata);
  console.log(maze);

  if (path.length < size) {
    console.log("Path too short");
    return false;
  }

  for (let i = 0; i < path.length; i += 2) {
    let x = path[i];
    let y = path[i + 1];
    if (maze[y][x] == 0) {
      console.log("Hit wall at", x, y);
      return false;
    }
  }
  console.log("No walls hit");
  return true;
}