import Stripe from "../config/stripe.js";
import CartProductModel from "../models/cartproduct.model.js";
import OrderModel from "../models/order.model.js";
import UserModel from "../models/user.model.js";
import ProductModel from "../models/product.model.js";
import mongoose from "mongoose";

export const pricewithDiscount = (price, dis = 1) => {
  const discountAmout = Math.ceil((Number(price) * Number(dis)) / 100);
  const actualPrice = Number(price) - Number(discountAmout);
  return actualPrice;
};

//transactions
export async function CashOnDeliveryOrderController(request, response) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = request.userId;
    const { list_items, totalAmt, addressId, subTotalAmt, deliveryCharge } =
      request.body;

    const orderId = `ORD-${new mongoose.Types.ObjectId()}`;

    const orderSubTotal = list_items.reduce((sum, item) => {
      const priceAfterDiscount = pricewithDiscount(
        item.productId.price,
        item.productId.discount,
      );
      return sum + priceAfterDiscount * item.quantity;
    }, 0);

    const correctOrderTotal = orderSubTotal + (deliveryCharge || 0);

    // Check and decrease stock for each product
    for (const item of list_items) {
      const product = await ProductModel.findById(item.productId._id).session(
        session,
      );

      if (!product) {
        throw new Error(`Product ${item.productId.name} not found`);
      }

      if (product.stock < item.quantity) {
        throw new Error(
          `Insufficient stock for ${item.productId.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
        );
      }

      // Decrease stock
      product.stock -= item.quantity;
      await product.save({ session });
    }

    // Create order items
    const orderItems = list_items.map((el) => {
      const priceAfterDiscount = pricewithDiscount(
        el.productId.price,
        el.productId.discount,
      );

      return {
        userId: userId,
        orderId: orderId,
        productId: el.productId._id,
        product_details: {
          name: el.productId.name,
          image: el.productId.image,
          price: el.productId.price,
          discount: el.productId.discount,
          unit: el.productId.unit,
        },
        quantity: el.quantity,
        itemSubTotal: priceAfterDiscount * el.quantity,

        paymentId: "",
        payment_status: "CASH ON DELIVERY",
        delivery_address: addressId,

        orderSubTotal: orderSubTotal,
        deliveryCharge: deliveryCharge || 0,
        orderTotal: correctOrderTotal,
      };
    });

    const generatedOrder = await OrderModel.insertMany(orderItems, { session });

    // Clear cart
    await CartProductModel.deleteMany({ userId: userId }, { session });
    await UserModel.updateOne(
      { _id: userId },
      { shopping_cart: [] },
      { session },
    );

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    return response.json({
      message: "Order placed successfully",
      error: false,
      success: true,
      data: {
        orderId: orderId,
        items: generatedOrder,
        orderSubTotal: orderSubTotal,
        deliveryCharge: deliveryCharge,
        orderTotal: correctOrderTotal,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return response.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
}


export async function paymentController(request, response) {
  try {
    const userId = request.userId;
    const { list_items, totalAmt, addressId, subTotalAmt, deliveryCharge } =
      request.body;

    const user = await UserModel.findById(userId);

    const line_items = list_items.map((item) => {
      return {
        price_data: {
          currency: "lkr",
          product_data: {
            name: item.productId.name,
            images: item.productId.image,
            metadata: {
              productId: item.productId._id,
              discount: item.productId.discount,
              unit: item.productId.unit,
            },
          },
          unit_amount:
            pricewithDiscount(item.productId.price, item.productId.discount) *
            100,
        },
        adjustable_quantity: {
          enabled: true,
          minimum: 1,
        },
        quantity: item.quantity,
      };
    });

    const params = {
      submit_type: "pay",
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email,
      metadata: {
        userId: userId,
        addressId: addressId,
        deliveryCharge: deliveryCharge || 0,
        orderTotal: totalAmt,
      },
      line_items: line_items,
      success_url: `${process.env.FRONTEND_URL}/success`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
    };

    const session = await Stripe.checkout.sessions.create(params);

    return response.status(200).json(session);
  } catch (error) {
    return response.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
}

const getOrderProductItems = async ({
  lineItems,
  userId,
  addressId,
  paymentId,
  payment_status,
  deliveryCharge,
  orderTotal,
}) => {
  const productList = [];
  const orderId = `ORD-${new mongoose.Types.ObjectId()}`;

  let orderSubTotal = 0;
  const itemsWithDetails = [];

  if (lineItems?.data?.length) {
    for (const item of lineItems.data) {
      const product = await Stripe.products.retrieve(item.price.product);
      const itemTotal = Number(item.amount_total / 100);
      orderSubTotal += itemTotal;

      itemsWithDetails.push({
        item,
        product,
        itemTotal,
      });
    }
  }

  for (const { item, product, itemTotal } of itemsWithDetails) {
    const originalPrice = item.price.unit_amount / 100;

    const payload = {
      userId: userId,
      orderId: orderId,
      productId: product.metadata.productId,
      product_details: {
        name: product.name,
        image: product.images,
        price: originalPrice,
        discount: Number(product.metadata.discount) || 0,
        unit: product.metadata.unit || "piece",
      },
      quantity: item.quantity,
      itemSubTotal: itemTotal,

      paymentId: paymentId,
      payment_status: payment_status,
      delivery_address: addressId,

      orderSubTotal: orderSubTotal,
      deliveryCharge: Number(deliveryCharge) || 0,
      orderTotal: Number(orderTotal) || orderSubTotal,
    };

    productList.push(payload);
  }

  return productList;
};

export async function webhookStripe(request, response) {
  const event = request.body;
  const endPointSecret = process.env.STRIPE_ENPOINT_WEBHOOK_SECRET_KEY;

  console.log("event", event);

  switch (event.type) {
    case "checkout.session.completed":
      const session = event.data.object;
      const lineItems = await Stripe.checkout.sessions.listLineItems(
        session.id,
      );
      const userId = session.metadata.userId;

      const orderProduct = await getOrderProductItems({
        lineItems: lineItems,
        userId: userId,
        addressId: session.metadata.addressId,
        paymentId: session.payment_intent,
        payment_status: session.payment_status,
        deliveryCharge: session.metadata.deliveryCharge,
        orderTotal: session.metadata.orderTotal,
      });

      const order = await OrderModel.insertMany(orderProduct);

      console.log("Order created:", order);

      if (Boolean(order[0])) {
        await UserModel.findByIdAndUpdate(userId, {
          shopping_cart: [],
        });
        await CartProductModel.deleteMany({ userId: userId });
      }
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  response.json({ received: true });
}

export async function getOrderDetailsController(request, response) {
  try {
    const userId = request.userId;

    const orderlist = await OrderModel.find({ userId: userId })
      .sort({ createdAt: -1 })
      .populate("delivery_address");

    return response.json({
      message: "order list",
      data: orderlist,
      error: false,
      success: true,
    });
  } catch (error) {
    return response.status(500).json({
      message: error.message || error,
      error: true,
      success: false,
    });
  }
}
