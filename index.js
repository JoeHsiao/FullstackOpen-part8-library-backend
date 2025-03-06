const { ApolloServer } = require('@apollo/server')
const { startStandaloneServer } = require('@apollo/server/standalone')
const mongoose = require('mongoose')
require('dotenv').config()

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

const typeDefs = `
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
  }

  type Query {
    bookCount: Int
    authorCount: Int
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
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
  },
  Author: {
    bookCount: async (root) => {
      return await Book.countDocuments({ author: root.id })
    }
  },
  Mutation: {
    addBook: async (root, args) => {
      const existingAuthor = await Author.findOne({ name: args.author })
      const author = existingAuthor
        ? existingAuthor
        : await new Author({ name: args.author }).save()
      const book = new Book({ ...args, author: author })
      await book.save()
      return book
    },
    editAuthor: async (root, args) => {
      const author = await Author.findOne({ name: args.name })
      if (!author) {
        throw new GraphQLError('Edit author born failed', {
          extensions: {
            code: 'AUTHOR_NOT_FOUND',
            invalidArgs: args.name
          }
        })
      }
      author.born = args.setBornTo
      return await author.save()
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

startStandaloneServer(server, {
  listen: { port: 4000 },
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})