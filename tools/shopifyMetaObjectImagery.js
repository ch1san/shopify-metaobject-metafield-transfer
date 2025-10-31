const axios = require('axios');
let envConfig = require('dotenv').config();
const parseArgs = require('minimist');
const fs = require('fs');
const path = require('path');
const csv = require('csv');
const {parse}  = require('csv-parse');
const {transform} = require('stream-transform');

if (!envConfig.error) {
  envConfig = envConfig.parsed;
}

const args = parseArgs(process.argv);
const env = args.env ? args.env : 'production'
const apiVersion = '2023-10';
const shop = envConfig[`SHOPIFY_${env.toUpperCase()}_STORE`];
const graphToken = envConfig[`SHOPIFY_${env.toUpperCase()}_PASS`];



const csvName = 'metaobjects-testimonials-1'; // variable
const shopifyFileName = path.resolve(`./tools/metaObject/${csvName}.csv`);
const shopifyNewFileName = path.resolve(`./tools/metaObject/${csvName}-NEW.csv`);

// const writeStream = fs.createWriteStream(shopifyNewFileName, {flags:'a'});
const writeStream = fs.createWriteStream(shopifyNewFileName);
const createFile = async (fileDef) => {
  
  // console.log('Creating Metafield.');
  // console.log(newMetafieldDefinition);

  const createFileMutation = `mutation fileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        alt
        createdAt
      }
    }
  }`;
  const body = {
    query: createFileMutation,
    variables: fileDef
  };
  return axios.post(
    'https://' + shop + '/admin/api/' + apiVersion + '/graphql.json', 
    body, 
    {
      'headers': {
        'X-Shopify-Access-Token': graphToken
      },
    }
  )
  .then(res => {
    console.log('response', res.data.data.fileCreate.files[0].id)
    return res.data.data.fileCreate.files[0].id;
  })
  .catch(e => {
    console.log('error')
    console.error(e.data);
    console.error(e);
    return false;
  })
}

const parser = parse({});

const img_ref = 'image' // image
const img_ref_col = 9
const img_url_col = 10
const img_alt_col = 5

const transformer = transform(async (record, callback) => {

  if (record[img_ref_col] === img_ref && record[img_url_col].indexOf('http') >= 0) {  
    console.log('START', record[8], 'UPLOAD')
    const newFile = {
      "files": {
        "alt": `${record[img_alt_col]}`,
        "contentType": "IMAGE",
        "originalSource": `${record[img_url_col]}`
      }
    }
    const newShopifyFileId = await createFile(newFile)
    if (newShopifyFileId) {
      console.log(newShopifyFileId)
      record[img_url_col] = newShopifyFileId
    }
    // callback(null, `"${record.join('","')}"\n`);
    // } else if (record[7] === 'title') {
    //   let newEntry = [...record];
    //   newEntry[7] = 'reference';
    //   newEntry[8] = record[1];
    //   callback(null, `"${record.join('","')}"\n"${newEntry.join('","')}"\n`);
    // } else {
  }
  callback(null, `"${record.join('","')}"\n`);
}, {
  parallel: 1
});

// Read CSV 1
const readShopifyFile = (callback) => {
  const readStream = fs.createReadStream(shopifyFileName, 'utf8');
  console.log('started')
  readStream
    .pipe(parser)
    .pipe(transformer)
    .pipe(writeStream)
    .on('end', () => {
      console.log('finished')
      callback()
    });
}

readShopifyFile(() => {
  // writeStream.end();
  console.log('end')
})


