const axios = require('axios');
let envConfig = require('dotenv').config();
const parseArgs = require('minimist');

if (!envConfig.error) {
  envConfig = envConfig.parsed;
}

const args = parseArgs(process.argv);
const env = args.env ? args.env : 'development';
const apiVersion = '2023-04';
const shop = envConfig[`SHOPIFY_${env.toUpperCase()}_STORE`];
const graphToken = envConfig[`SHOPIFY_${env.toUpperCase()}_PASS`];

const newShop = envConfig[`SHOPIFY_COPY_${env.toUpperCase()}_STORE`];
const newGraphToken = envConfig[`SHOPIFY_COPY_${env.toUpperCase()}_PASS`];

// npm run copy:metaobjects -- --env=production

const metaObjectsMapping = [];

const prepMetaObjects = async () => {
  const getMetaObjectsQuery = `{
    metaobjectDefinitions(first:100) {
      edges {
        node {
          id
          type
        }
      }
    }
  }`;

  return axios
    .post(
      'https://' + shop + '/admin/api/' + apiVersion + '/graphql.json',
      {
        query: getMetaObjectsQuery,
      },
      {
        headers: {
          'X-Shopify-Access-Token': graphToken,
        },
      }
    )
    .then((res) => {
      console.log('from shop defs');
      // console.log(res)
      // console.log(res.data.data.metaobjectDefinitions)
      res.data.data.metaobjectDefinitions.edges.forEach((m) => {
        metaObjectsMapping.push({
          type: m.node.type,
          from: m.node.id,
          to: '',
        });
      });
      // console.log(metaObjectsMapping)
      return axios
        .post(
          'https://' + newShop + '/admin/api/' + apiVersion + '/graphql.json',
          {
            query: getMetaObjectsQuery,
          },
          {
            headers: {
              'X-Shopify-Access-Token': newGraphToken,
            },
          }
        )
        .then((res) => {
          console.log('to shop defs');
          // console.log(res.data.data.metaobjectDefinitions.edges)
          res.data.data.metaobjectDefinitions.edges.forEach((m) => {
            const curObjIndex = metaObjectsMapping.findIndex((mo) => mo.type === m.node.type);
            if (curObjIndex >= 0) {
              metaObjectsMapping[curObjIndex] = {
                ...metaObjectsMapping[curObjIndex],
                to: m.node.id,
              };
            } else {
              metaObjectsMapping.push({
                type: m.node.type,
                from: '',
                to: m.node.id,
              });
            }
          });
          // console.log(metaObjectsMapping)
          return metaObjectsMapping;
        })
        .catch((e) => {
          console.log('error 2');
          console.error(e.data);
          return false;
        });
    })
    .catch((e) => {
      console.log('error 1');
      console.error(e.data);
      return false;
    });
};

const createMetaObject = (newMetaObjectDefinition) => {
  console.log('Creating Meta Object.');
  // console.log(newMetaObjectDefinition);

  const createMetaObjectMutation = `mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        name
        type
        capabilities {
          publishable {
            enabled
          }
        }
        fieldDefinitions {
          name
          key
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }`;
  const body = {
    query: createMetaObjectMutation,
    variables: newMetaObjectDefinition,
  };
  axios
    .post('https://' + newShop + '/admin/api/' + apiVersion + '/graphql.json', body, {
      headers: {
        'X-Shopify-Access-Token': newGraphToken,
      },
    })
    .then((res) => {
      if (res.data.data.metaobjectDefinitionCreate?.userErrors[0]?.code === 'TAKEN') {
        console.log(`${newMetaObjectDefinition.definition.name} already exists`);
      } else {
        console.error(`!Error ${newMetaObjectDefinition.definition.name}`);
        if (res.data.data.metaobjectDefinitionCreate?.userErrors.length > 0) {
          console.error(JSON.stringify(res.data.data.metaobjectDefinitionCreate.userErrors));
        }
      }
    })
    .catch((e) => {
      console.log('createMetaObject error');
      console.error(e.data, e);
      return false;
    });
};

const getMetaObjectsQuery = `query getMeta($cursor:String) {
  metaobjectDefinitions(first:1, after: $cursor) {
    edges {
      node {
        name
        type
        description
        displayNameKey
        access {
          admin
          storefront
        }
        capabilities {
          publishable {
            enabled
          }
          translatable {
            enabled
          }
        }
        fieldDefinitions {
          name
          key
          type {
            name
          }
          validations {
            name
            value
          }
        }
      }
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}`;

const getMetaObjects = (cursor = '') => {
  console.log('Getting MetaObjects.');

  let body = {
    query: getMetaObjectsQuery,
  };
  if (cursor.length > 0) {
    body = { ...body, variables: { cursor: cursor } };
  }
  axios
    .post('https://' + shop + '/admin/api/' + apiVersion + '/graphql.json', body, {
      headers: {
        'X-Shopify-Access-Token': graphToken,
      },
    })
    .then((res) => {
      // console.log(res.data)
      const graphData = res.data.data.metaobjectDefinitions;
      let MetaObjects = graphData.edges;
      MetaObjects.map((m) => {
        let newDef = { definition: m.node };
        newDef.definition.fieldDefinitions.map((f) => (f.type = f.type.name));
        newDef.definition.fieldDefinitions.map(
          (f) =>
            (f.validations = f.validations.map((v) => {
              if (v.name === 'metaobject_definition_id') {
                const foundMetaObject = metaObjectsMapping.find((mo) => mo.from === v.value);
                console.log(foundMetaObject);
                return {
                  name: 'metaobject_definition_id',
                  value: foundMetaObject.to || v.value,
                };
              } else {
                return v;
              }
            }))
        );
        // console.log(JSON.stringify(newDef))
        createMetaObject(newDef);
      });
      if (graphData.pageInfo.hasNextPage) {
        getMetaObjects(graphData.pageInfo.endCursor);
      }
    })
    .catch((e) => {
      console.error(e);
      return false;
    });
};

const processData = async () => {
  await prepMetaObjects();
  console.log('linked meta objects', metaObjectsMapping);
  getMetaObjects();
};
processData();
