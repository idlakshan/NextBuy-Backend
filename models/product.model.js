import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
    name : {
        type : String,
    },
    image : {
        type : Array,
        default : []
    },
    category : [
        {
            type : mongoose.Schema.ObjectId,
            ref : 'Category'
        }
    ],
    subCategory : [
        {
            type : mongoose.Schema.ObjectId,
            ref : 'SubCategory'
        }
    ],
    unit : {
        type : String,
        defualt : ""
    },
    stock : {
        type : Number,
        defualt : null
    },
    price : {
        type : Number,
        defualt : null
    },
    discount : {
        type : Number,
        default : null
    },
    description : {
        type : String,
        default : ""
    },
    more_details : {
        type : Object,
        default : {}
    },
    publish : {
        type : Boolean,
        default : true
    }
},{
    timestamps : true
})

const ProductModel = mongoose.model('Product',productSchema)

export default ProductModel