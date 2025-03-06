const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const mongoose = require('mongoose')
require('dotenv').config()
const jwt = require('jsonwebtoken')

mongoose.set('strictQuery', false)
const MONGODB_URI = process.env.MONGODB_URI

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.error('error connection to MongoDB:', error.message)
  })

const Book = require('./models/book')
const Author = require('./models/author')
const User = require('./models/user')
const { GraphQLError } = require('graphql')

const typeDefs = `
  type User {
    username: String!
    favoriteGenre: String!
    id: ID!
  }

  type Token {
    value: String!
  }

  type Book {
    title: String!
    published: Int!
    author: Author!
    id: ID!
    genres: [String!]!
  }

  type Author {
    name: String!
    id: ID!
    born: Int
    bookCount: Int
  }

  type Mutation {
    addBook(
      title: String!
      author: String!
      published: Int!
      genres:[String!]
    ): Book!
    editAuthor(
      name: String!
      setBornTo: Int!
    ): Author
    createUser(
      username: String!
      favoriteGenre: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
  }

  type Query {
    bookCount: Int
    authorCount: Int
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
    me: User
  }
`
const resolvers = {
  Query: {
    bookCount: async () => await Book.countDocuments({}),
    authorCount: async () => await Author.countDocuments({}),
    allBooks: async (root, args) => {
      const bookQuery = {}
      if (args.author) {
        bookQuery.author = args.author
      }
      if (args.genre) {
        bookQuery.genres = args.genre
      }
      return await Book.find(bookQuery).populate('author')
    },
    allAuthors: async () => await Author.find({}),
    me: (root, args, context) => {
      return context.currentUser
    }
  },
  Author: {
    bookCount: async (root) => {
      return await Book.countDocuments({ author: root.id })
    }
  },
  Mutation: {
    addBook: async (root, args, context) => {
      if (!context.currentUser) {
        throw new GraphQLError('Invalid credential', {
          extensions: {
            code: 'NOT_LOGIN',
          }
        })
      }

      const existingAuthor = await Author.findOne({ name: args.author })
      const author = existingAuthor || await (async () => {
        try {
          return await new Author({ name: args.author }).save()
        } catch (error) {
          throw new GraphQLError('Creating user failed', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.author,
              error
            }
          })
        }
      })()

      const book = new Book({ ...args, author: author })
      try {
        await book.save()
      } catch (error) {
        throw new GraphQLError('Creating book failed', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.title,
            error
          }
        })
      }
      return book
    },
    editAuthor: async (root, args, context) => {
      if (!context.currentUser) {
        throw new GraphQLError('Invalid credential', {
          extensions: {
            code: 'NOT_LOGIN',
          }
        })
      }
      const author = await Author.findOne({ name: args.name })
      if (!author) {
        throw new GraphQLError('Edit author born failed', {
          extensions: {
            code: 'AUTHOR_NOT_FOUND',
            invalidArgs: args.name,
          }
        })
      }
      author.born = args.setBornTo
      return await author.save()
    },
    createUser: async (root, args) => {
      const addUser = async () => {
        try {
          return await new User({ ...args }).save()
        } catch (error) {
          throw new GraphQLError('Failed create user', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.username,
              error
            }
          })
        }
      }
      return await addUser()
    },
    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })
      if (!user || args.password !== 'secret') {
        throw new GraphQLError('wrong credentials', {
          extensions: {
            code: 'BAD_USER_INPUT'
          }
        })
      }
      const token = {
        username: user.username,
        id: user._id
      }
      return { value: jwt.sign(token, process.env.JWT_SECRET) }
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

startStandaloneServer(server, {
  listen: { port: 4000 },
  context: async ({ req, res }) => {
    const auth = req ? req.headers.authorization : null
    if (auth && auth.startsWith('Bearer ')) {
      const decodedToken = jwt.verify(
        auth.substring(7), process.env.JWT_SECRET
      )
      const currentUser = await User.findById(decodedToken.id)
      return { currentUser }
    }
  }
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})